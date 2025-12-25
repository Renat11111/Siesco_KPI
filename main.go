package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/mail"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Структуры конфигурации
type StatusConfig struct {
	Title string `json:"title"`
	Slug  string `json:"slug"`
	Color string `json:"color"`
	Type  string `json:"type"` // "final", "in_progress", "return"
}

// Global map to store status types for helper functions
var GlobalStatusMap = make(map[string]string)

type TaskFieldConfig struct {
	Key        string `json:"key"`
	Title      string `json:"title"`
	Type       string `json:"type"`
	Required   bool   `json:"required"`
	Width      string `json:"width"`
	Filterable bool   `json:"filterable"` 
}

type AppConfig struct {
	Statuses   []StatusConfig    `json:"statuses"`
	TaskFields []TaskFieldConfig `json:"task_fields"`
}

func main() {
	app := pocketbase.New()

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/hello", func(e *core.RequestEvent) error {
			return e.String(200, "Hello world!")
		})

		// Custom Endpoint for Monthly Ranking
		e.Router.GET("/api/kpi/ranking", func(e *core.RequestEvent) error {
			month := e.Request.URL.Query().Get("month") // Expects "YYYY-MM"
			if month == "" {
				return e.BadRequestError("Month parameter is required (YYYY-MM)", nil)
			}

			start := month + "-01 00:00:00"
			end := month + "-31 23:59:59"
			response, err := streamRanking(app, start, end)
			if err != nil {
				return e.InternalServerError("Failed to calculate ranking", err)
			}
			return e.JSON(200, response)
		})

		// Custom Endpoint for Yearly Ranking
		e.Router.GET("/api/kpi/yearly-ranking", func(e *core.RequestEvent) error {
			year := e.Request.URL.Query().Get("year") // Expects "YYYY"
			if year == "" {
				return e.BadRequestError("Year parameter is required (YYYY)", nil)
			}

			start := year + "-01-01 00:00:00"
			end := year + "-12-31 23:59:59"

			response, err := streamRanking(app, start, end)
			if err != nil {
				return e.InternalServerError("Failed to calculate yearly stats", err)
			}
			
			return e.JSON(200, response)
		})

		// Custom Endpoint for Actual Unfinished Tasks
		e.Router.GET("/api/kpi/actual-tasks", func(e *core.RequestEvent) error {
			start := e.Request.URL.Query().Get("start")
			end := e.Request.URL.Query().Get("end")
			targetUser := e.Request.URL.Query().Get("user")

			if start == "" || end == "" {
				return e.BadRequestError("Start and End dates are required", nil)
			}

			filter := "file_date >= {:start} && file_date <= {:end}"
			params := map[string]interface{}{ "start": start, "end": end }
			if targetUser != "" {
				filter += " && user = {:user}"
				params["user"] = targetUser
			}

			records, err := app.FindRecordsByFilter("tasks", filter, "+file_date", 10000, 0, params)
			if err != nil {
				return e.InternalServerError("Failed to fetch tasks", err)
			}

			latestTasks := make(map[string]map[string]interface{})
			taskMeta := make(map[string]map[string]string) 

			for _, r := range records {
				taskList, err := parseTaskData(r.GetString("data"))
				if err != nil { continue }

				fileDate := r.GetString("file_date")
				fileId := r.Id

				for _, t := range taskList {
					taskNum := fmt.Sprintf("%v", t["task_number"])
					if taskNum == "" { continue }

					latestTasks[taskNum] = t
					taskMeta[taskNum] = map[string]string{
						"source_file_date": fileDate,
						"source_file_id":   fileId,
					}
				}
			}

			result := []map[string]interface{}{}

			for tNum, task := range latestTasks {
				// Check strictly for unfinished statuses
				if isStatusInProgress(task["status"]) {
					
					if meta, exists := taskMeta[tNum]; exists {
						task["source_file_date"] = meta["source_file_date"]
						task["source_file_id"] = meta["source_file_id"]
					}
					result = append(result, task)
				}
			}

			return e.JSON(200, result)
		})

		// Custom Endpoint for Grouping Completed Tasks
		e.Router.GET("/api/kpi/completed-tasks-grouped", func(e *core.RequestEvent) error {
			start := e.Request.URL.Query().Get("start")
			end := e.Request.URL.Query().Get("end")
			targetUser := e.Request.URL.Query().Get("user")

			if start == "" || end == "" {
				return e.BadRequestError("Start and End dates are required", nil)
			}

			filter := "file_date >= {:start} && file_date <= {:end}"
			params := map[string]interface{}{ "start": start, "end": end }
			if targetUser != "" {
				filter += " && user = {:user}"
				params["user"] = targetUser
			}

			records, err := app.FindRecordsByFilter("tasks", filter, "+file_date", 10000, 0, params)
			if err != nil {
				return e.InternalServerError("Failed to fetch tasks", err)
			}

			type AggregatedTask struct {
				LatestData      map[string]interface{}
				TotalTimeSpent  float64
				LatestFileDate  string
				LatestFileId    string
			}

			taskMap := make(map[string]*AggregatedTask)

			for _, r := range records {
				taskList, err := parseTaskData(r.GetString("data"))
				if err != nil { continue }

				fileDate := r.GetString("file_date")
				fileId := r.Id

				for _, t := range taskList {
					taskNumStr := fmt.Sprintf("%v", t["task_number"])
					if taskNumStr == "" { continue }

					if _, exists := taskMap[taskNumStr]; !exists {
						taskMap[taskNumStr] = &AggregatedTask{
							LatestData:     t,
							TotalTimeSpent: 0,
							LatestFileDate: fileDate,
							LatestFileId:   fileId,
						}
					}

					agg := taskMap[taskNumStr]

					// Sum time_spent
					agg.TotalTimeSpent += getTimeSpent(t["time_spent"])

					// Update latest data
					agg.LatestData = t
					agg.LatestFileDate = fileDate
					agg.LatestFileId = fileId
				}
			}

			result := []map[string]interface{}{}

			for _, agg := range taskMap {
				// Check strictly for COMPLETED statuses
				if isStatusCompleted(agg.LatestData["status"]) {
					
					agg.LatestData["time_spent"] = agg.TotalTimeSpent
					agg.LatestData["source_file_date"] = agg.LatestFileDate
					agg.LatestData["source_file_id"] = agg.LatestFileId
					
					result = append(result, agg.LatestData)
				}
			}

			return e.JSON(200, result)
		})

		// Custom Endpoint for Actual Returned Tasks (In Progress Return)
		e.Router.GET("/api/kpi/returned-tasks", func(e *core.RequestEvent) error {
			start := e.Request.URL.Query().Get("start")
			end := e.Request.URL.Query().Get("end")
			targetUser := e.Request.URL.Query().Get("user")

			if start == "" || end == "" {
				return e.BadRequestError("Start and End dates are required", nil)
			}

			filter := "file_date >= {:start} && file_date <= {:end}"
			params := map[string]interface{}{ "start": start, "end": end }
			if targetUser != "" {
				filter += " && user = {:user}"
				params["user"] = targetUser
			}

			records, err := app.FindRecordsByFilter("tasks", filter, "+file_date", 10000, 0, params)
			if err != nil {
				return e.InternalServerError("Failed to fetch tasks", err)
			}

			latestTasks := make(map[string]map[string]interface{})
			taskMeta := make(map[string]map[string]string) 

			for _, r := range records {
				taskList, err := parseTaskData(r.GetString("data"))
				if err != nil { continue }

				fileDate := r.GetString("file_date")
				fileId := r.Id

				for _, t := range taskList {
					taskNum := fmt.Sprintf("%v", t["task_number"])
					if taskNum == "" { continue }

					latestTasks[taskNum] = t
					taskMeta[taskNum] = map[string]string{
						"source_file_date": fileDate,
						"source_file_id":   fileId,
					}
				}
			}

			result := []map[string]interface{}{}

			for tNum, task := range latestTasks {
				// Check strictly for RETURNED statuses (In Progress Return only)
				if isStatusInProgressReturn(task["status"]) {
					
					if meta, exists := taskMeta[tNum]; exists {
						task["source_file_date"] = meta["source_file_date"]
						task["source_file_id"] = meta["source_file_id"]
					}
					result = append(result, task)
				}
			}

			return e.JSON(200, result)
		})

		// Endpoint to update task time_spent (Admin/Coordinator only)
		e.Router.POST("/api/kpi/update-task-time", func(e *core.RequestEvent) error {
			// Check permissions: only superadmin or coordinator
			admin := e.Auth
			if admin == nil {
				return e.UnauthorizedError("Login required", nil)
			}
			
			isSuper := admin.GetBool("superadmin")
			isCoord := admin.GetBool("is_coordinator")

			if !isSuper && !isCoord {
				return e.ForbiddenError("Insufficient permissions", nil)
			}

			data := struct {
				RecordId   string  `json:"record_id"`
				TaskNumber string  `json:"task_number"`
				NewTime    float64 `json:"new_time"`
			}{}

			if err := e.BindBody(&data); err != nil {
				return e.BadRequestError("Invalid request body", err)
			}

			if data.RecordId == "" || data.TaskNumber == "" {
				return e.BadRequestError("record_id and task_number are required", nil)
			}

			record, err := app.FindRecordById("tasks", data.RecordId)
			if err != nil {
				return e.NotFoundError("Record not found", err)
			}

			taskList, err := parseTaskData(record.GetString("data"))
			if err != nil {
				return e.InternalServerError("Failed to parse task data", err)
			}

			found := false
			updated := false

			for i, t := range taskList {
				tNumStr := fmt.Sprintf("%v", t["task_number"])

				if tNumStr == data.TaskNumber {
					found = true
					
					// Get current time
					currentTime := getTimeSpent(t["time_spent"])

					// Update logic
					if currentTime != data.NewTime {
						updated = true
						
						alreadyEdited, _ := t["is_edited"].(bool)

						if !alreadyEdited {
							t["original_time_spent"] = currentTime
						}
						
						t["time_spent"] = data.NewTime
						t["is_edited"] = true

						taskList[i] = t 
					}
					break
				}
			}

			if !found {
				return e.NotFoundError("Task number not found in this record", nil)
			}

			if updated {
				newJsonBytes, err := json.Marshal(taskList)
				if err != nil {
					return e.InternalServerError("Failed to serialize updated data", err)
				}
				record.Set("data", string(newJsonBytes))
				if err := app.Save(record); err != nil {
					return e.InternalServerError("Failed to save record", err)
				}
			}

			return e.JSON(200, map[string]interface{}{"success": true, "updated": updated})
		})

		// --- HOOK: Leave Request Security & Notification ---
		app.OnRecordCreateRequest("leave_requests").BindFunc(func(e *core.RecordRequestEvent) error {
			if e.Auth != nil {
				e.Record.Set("user", e.Auth.Id)
			}

			if err := e.Next(); err != nil {
				return err
			}

			requestRecord := e.Record
			user, _ := app.FindRecordById("users", requestRecord.GetString("user"))
			userName := "Unknown"
			if user != nil { userName = user.GetString("name") }

			admins, err := app.FindRecordsByFilter("users", "superadmin=true || is_coordinator=true", "", 100, 0, nil)
			if err != nil || len(admins) == 0 { return nil }

			subject := fmt.Sprintf("New Leave Request from %s", userName)
			body := fmt.Sprintf(`<h3>New Leave Request</h3><p><strong>User:</strong> %s</p><p><strong>From:</strong> %s</p><p><strong>To:</strong> %s</p><p><strong>Reason:</strong> %s</p>`, 
				userName, requestRecord.GetString("start_date"), requestRecord.GetString("end_date"), requestRecord.GetString("reason"))

			senderAddress := app.Settings().Meta.SenderAddress
			senderName := app.Settings().Meta.SenderName
			
			for _, admin := range admins {
				email := admin.GetString("email")
				if email == "" { continue }
				message := &mailer.Message{
					From:    mail.Address{Address: senderAddress, Name: senderName},
					To:      []mail.Address{{Address: email}},
					Subject: subject,
					HTML:    body,
				}
				app.NewMailClient().Send(message)
			}
			return nil
		})

		if err := bootstrapCollections(app); err != nil {
			log.Printf("Bootstrap warning: %v", err)
		}

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func bootstrapCollections(app *pocketbase.PocketBase) error {
	var err error
	var leaveReqs *core.Collection

	// --- 1. Модификация коллекции Users ---
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	targetRule := "@request.auth.id != ''"
	if users.ListRule == nil || *users.ListRule != targetRule {
		users.ListRule = types.Pointer(targetRule)
		users.ViewRule = types.Pointer(targetRule)
		if err := app.Save(users); err != nil {
			return err
		}
	}

	if users.Fields.GetByName("superadmin") == nil {
		users.Fields.Add(&core.BoolField{ Name: "superadmin" })
		if err := app.Save(users); err != nil { return err }
	}

	if users.Fields.GetByName("is_coordinator") == nil {
		users.Fields.Add(&core.BoolField{ Name: "is_coordinator" })
		if err := app.Save(users); err != nil { return err }
	}

	// --- 1.1 Create/Update 'leave_requests' collection ---
	leaveReqs, err = app.FindCollectionByNameOrId("leave_requests")
	if err != nil {
		log.Println("Creating 'leave_requests' collection...")
		leaveReqs = core.NewBaseCollection("leave_requests")
		if err := app.Save(leaveReqs); err != nil { return err }
	}
	if leaveReqs.Fields.GetByName("user") == nil { leaveReqs.Fields.Add(&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true}) }
	if leaveReqs.Fields.GetByName("start_date") == nil { leaveReqs.Fields.Add(&core.DateField{Name: "start_date", Required: true}) }
	if leaveReqs.Fields.GetByName("end_date") == nil { leaveReqs.Fields.Add(&core.DateField{Name: "end_date", Required: true}) }
	if leaveReqs.Fields.GetByName("reason") == nil { leaveReqs.Fields.Add(&core.TextField{Name: "reason", Required: true}) }
	if leaveReqs.Fields.GetByName("status") == nil { leaveReqs.Fields.Add(&core.SelectField{Name: "status", MaxSelect: 1, Values: []string{"pending", "approved", "rejected"}}) }
	if leaveReqs.Fields.GetByName("created") == nil { leaveReqs.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true}) }
	if leaveReqs.Fields.GetByName("updated") == nil { leaveReqs.Fields.Add(&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true}) }

	lrRule := "@request.auth.id != '' && (@request.auth.id = user || @request.auth.superadmin = true || @request.auth.is_coordinator = true)"
	leaveReqs.ListRule = types.Pointer(lrRule)
	leaveReqs.ViewRule = types.Pointer(lrRule)
	leaveReqs.CreateRule = types.Pointer("@request.auth.id != ''")
	leaveReqs.UpdateRule = types.Pointer("@request.auth.superadmin = true || @request.auth.is_coordinator = true")
	leaveReqs.DeleteRule = types.Pointer("@request.auth.superadmin = true || @request.auth.is_coordinator = true")
	if err := app.Save(leaveReqs); err != nil { log.Printf("Failed to save leave_requests: %v", err) }

	// --- 2. Создание/Обновление коллекции Tasks ---
	tasksCollection, err := app.FindCollectionByNameOrId("tasks")
	if err != nil {
		log.Println("Creating 'tasks' collection...")
		tasksCollection = core.NewBaseCollection("tasks")
		
		tasksCollection.ListRule = types.Pointer("@request.auth.id != ''")
		tasksCollection.ViewRule = types.Pointer("@request.auth.id != '' && @request.auth.id = user")
		tasksCollection.CreateRule = types.Pointer("@request.auth.id != ''")
		tasksCollection.UpdateRule = types.Pointer("@request.auth.id != '' && @request.auth.id = user")
		tasksCollection.DeleteRule = types.Pointer("@request.auth.id != '' && @request.auth.id = user")

		tasksCollection.Fields.Add(&core.RelationField{
			Name:          "user",
			Required:      true,
			MaxSelect:     1,
			CascadeDelete: false,
			CollectionId:  users.Id,
		})

		tasksCollection.Fields.Add(&core.RelationField{
			Name:          "uploaded_by",
			Required:      false,
			MaxSelect:     1,
			CascadeDelete: false,
			CollectionId:  users.Id,
		})

		tasksCollection.Fields.Add(&core.JSONField{
			Name:     "data",
			Required: false,
			MaxSize:  2000000,
		})

		tasksCollection.Fields.Add(&core.FileField{
			Name:      "excel_file",
			MaxSelect: 1,
			MaxSize:   5242880,
			MimeTypes: []string{
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"application/vnd.ms-excel",
			},
		})

		tasksCollection.Fields.Add(&core.DateField{
			Name:     "file_date",
			Required: false,
		})
	}

	// Update rules to ensure superadmins can delete/update
	tasksCollection.ListRule = types.Pointer("@request.auth.id != '' && (@request.auth.id = user || @request.auth.superadmin = true || @request.auth.is_coordinator = true)")
	tasksCollection.ViewRule = types.Pointer("@request.auth.id != '' && (@request.auth.id = user || @request.auth.superadmin = true || @request.auth.is_coordinator = true)")
	tasksCollection.DeleteRule = types.Pointer("@request.auth.id != '' && (@request.auth.id = user || @request.auth.superadmin = true)")

	if tasksCollection.Fields.GetByName("file_name") == nil {
		tasksCollection.Fields.Add(&core.TextField{ Name: "file_name" })
	}

	// Indexes
	idxList := []struct { Name string; Unique bool; Columns string }{
		{"idx_tasks_file_date", false, "file_date"},
		{"idx_tasks_user", false, "user"},
		{"idx_tasks_user_file_date", false, "user,file_date"},
	}
	for _, idx := range idxList {
		exists := false
		for _, existing := range tasksCollection.Indexes { if strings.Contains(existing, idx.Name) { exists = true; break } }
		if !exists { tasksCollection.AddIndex(idx.Name, idx.Unique, idx.Columns, "") }
	}

	if err := app.Save(tasksCollection); err != nil { return err }

	// --- 2.1 Создание коллекции 'deletion_logs' ---
	deletionLogs, err := app.FindCollectionByNameOrId("deletion_logs")
	if err != nil {
		deletionLogs = core.NewBaseCollection("deletion_logs")
		deletionLogs.ListRule = types.Pointer("@request.auth.superadmin = true")
		deletionLogs.Fields.Add(&core.TextField{Name: "file_name", Required: true})
		deletionLogs.Fields.Add(&core.TextField{Name: "reason", Required: true})
		deletionLogs.Fields.Add(&core.RelationField{ Name: "deleted_by", CollectionId: users.Id, MaxSelect: 1 })
		deletionLogs.Fields.Add(&core.FileField{ Name: "excel_file", MaxSelect: 1, MimeTypes: []string{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel"}})
		deletionLogs.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		if err := app.Save(deletionLogs); err != nil { return err }
	}

	// --- 2.2 Создание коллекции 'upload_logs' ---
	uploadLogs, err := app.FindCollectionByNameOrId("upload_logs")
	if err != nil {
		uploadLogs = core.NewBaseCollection("upload_logs")
		uploadLogs.ListRule = types.Pointer("@request.auth.superadmin = true")
		uploadLogs.Fields.Add(&core.TextField{Name: "file_name", Required: true})
		uploadLogs.Fields.Add(&core.RelationField{Name: "uploaded_by", CollectionId: users.Id, MaxSelect: 1})
		uploadLogs.Fields.Add(&core.RelationField{Name: "target_user", CollectionId: users.Id, MaxSelect: 1})
		uploadLogs.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		if err := app.Save(uploadLogs); err != nil { return err }
	}

	// --- 3. Чтение config.json ---
	configFile, err := os.Open("config.json")
	if err == nil {
		defer configFile.Close()
		bytes, _ := io.ReadAll(configFile)
		var appConfig AppConfig
		json.Unmarshal(bytes, &appConfig)

		// Populate global map with both Slug and Title for flexible lookup
		for _, s := range appConfig.Statuses {
			GlobalStatusMap[strings.ToLower(strings.TrimSpace(s.Slug))] = s.Type
			GlobalStatusMap[strings.ToLower(strings.TrimSpace(s.Title))] = s.Type
		}

		statusesCollection, err := app.FindCollectionByNameOrId("statuses")
		if err != nil {
			statusesCollection = core.NewBaseCollection("statuses")
			statusesCollection.ListRule = types.Pointer("@request.auth.id != ''")
			statusesCollection.Fields.Add(&core.TextField{Name: "title", Required: true})
			statusesCollection.Fields.Add(&core.TextField{Name: "slug", Required: true})
			statusesCollection.Fields.Add(&core.SelectField{Name: "color", Required: true, MaxSelect: 1, Values: []string{"slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "success", "warning", "danger", "info", "primary", "secondary"}})
			statusesCollection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
			
			if err := app.Save(statusesCollection); err != nil {
				return err
			}

			// Populate initial statuses
			for _, s := range appConfig.Statuses {
				record := core.NewRecord(statusesCollection)
				record.Set("title", s.Title); record.Set("slug", s.Slug); record.Set("color", s.Color)
				app.Save(record)
			}
		}

		fieldsCollection, err := app.FindCollectionByNameOrId("task_fields")
		if err != nil {
			fieldsCollection = core.NewBaseCollection("task_fields")
			fieldsCollection.ListRule = types.Pointer("@request.auth.id != ''")
			fieldsCollection.Fields.Add(&core.TextField{Name: "key", Required: true})
			fieldsCollection.Fields.Add(&core.TextField{Name: "title", Required: true})
			fieldsCollection.Fields.Add(&core.TextField{Name: "type", Required: true})
			fieldsCollection.Fields.Add(&core.TextField{Name: "width"})
			fieldsCollection.Fields.Add(&core.BoolField{Name: "required"})
			fieldsCollection.Fields.Add(&core.BoolField{Name: "filterable"})
			fieldsCollection.Fields.Add(&core.NumberField{Name: "order"})
			
			if err := app.Save(fieldsCollection); err != nil {
				return err
			}

			// Populate initial task_fields
			for i, f := range appConfig.TaskFields {
				record := core.NewRecord(fieldsCollection)
				record.Set("key", f.Key); record.Set("title", f.Title); record.Set("type", f.Type); record.Set("required", f.Required); record.Set("width", f.Width); record.Set("filterable", f.Filterable); record.Set("order", i)
				app.Save(record)
			}
		}
	}

	// --- 6. View Collection 'monthly_user_stats' ---
	monthlyStats, err := app.FindCollectionByNameOrId("monthly_user_stats")
	if err != nil {
		monthlyStats = core.NewBaseCollection("monthly_user_stats")
		monthlyStats.Type = core.CollectionTypeView
		monthlyStats.ViewQuery = `SELECT (t.user || '_' || strftime('%Y-%m', t.file_date)) as id, t.user as user, u.name as user_name, u.email as user_email, strftime('%Y-%m', t.file_date) as month, COALESCE(SUM((SELECT SUM(COALESCE(json_extract(value, '$.time_spent'), 0)) FROM json_each(t.data))), 0) as total_hours FROM tasks t JOIN users u ON u.id = t.user GROUP BY t.user, month`
		monthlyStats.ListRule = types.Pointer("@request.auth.id != ''")
		monthlyStats.Fields.Add(&core.NumberField{Name: "total_hours"})
		monthlyStats.Fields.Add(&core.TextField{Name: "user_name"})
		monthlyStats.Fields.Add(&core.TextField{Name: "user_email"})
		monthlyStats.Fields.Add(&core.TextField{Name: "month"})
		monthlyStats.Fields.Add(&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1})
		app.Save(monthlyStats)
	}

	return nil
}

func streamRanking(app *pocketbase.PocketBase, start, end string) (interface{}, error) {
	// Raw SQL query to fetch minimal data
	query := app.DB().NewQuery("SELECT user, data FROM tasks WHERE file_date >= {:start} AND file_date <= {:end} ORDER BY file_date ASC")
	query.Bind(map[string]interface{}{
		"start": start,
		"end":   end,
	})

	rows, err := query.Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type UserStats struct {
		UserId         string
		TotalHours     float64
		TaskStatuses   map[string]string
	}
	statsMap := make(map[string]*UserStats)

	// Variables for scanning
	var userId string
	var dataJson string

	for rows.Next() {
		if err := rows.Scan(&userId, &dataJson); err != nil {
			continue
		}
		if userId == "" { continue }

		if _, exists := statsMap[userId]; !exists {
			statsMap[userId] = &UserStats{
				UserId:       userId,
				TotalHours:   0,
				TaskStatuses: make(map[string]string),
			}
		}
		entry := statsMap[userId]

		// Use our helper
		taskList, err := parseTaskData(dataJson)
		if err != nil {
			log.Printf("Error parsing streamed task data for user %s: %v", userId, err)
			continue
		}

		for _, t := range taskList {
			entry.TotalHours += getTimeSpent(t["time_spent"])
			
			tNum := fmt.Sprintf("%v", t["task_number"])
			if tNum != "" {
				entry.TaskStatuses[tNum] = fmt.Sprintf("%v", t["status"])
			}
		}
	}

	// Fetch users mapping (small data, usually < 100 users)
	users, _ := app.FindRecordsByFilter("users", "id != ''", "", 1000, 0, nil)
	userMap := make(map[string]string)
	emailMap := make(map[string]string)
	for _, u := range users {
		userMap[u.Id] = u.GetString("name")
		emailMap[u.Id] = u.GetString("email")
	}

	type ResponseItem struct {
		UserId         string  `json:"user_id"`
		UserName       string  `json:"user_name"`
		UserEmail      string  `json:"user_email"`
		TotalHours     float64 `json:"total_hours"`
		CompletedTasks int     `json:"completed_tasks"`
	}

	response := []ResponseItem{}

	for userId, stat := range statsMap {
		completedCount := 0
		for _, status := range stat.TaskStatuses {
			if isStatusCompleted(status) {
				completedCount++
			}
		}
		name := userMap[userId]
		if name == "" { name = "Unknown" }

		response = append(response, ResponseItem{
			UserId:         userId,
			UserName:       name,
			UserEmail:      emailMap[userId],
			TotalHours:     stat.TotalHours,
			CompletedTasks: completedCount,
		})
	}
	return response, nil
}

// --- Helpers ---

func parseTaskData(jsonStr string) ([]map[string]interface{}, error) {
	if jsonStr == "" {
		return []map[string]interface{}{}, nil
	}
	var taskList []map[string]interface{}
	decoder := json.NewDecoder(strings.NewReader(jsonStr))
	decoder.UseNumber()
	if err := decoder.Decode(&taskList); err != nil {
		return nil, err
	}
	return taskList, nil
}

func getTimeSpent(v interface{}) float64 {
	if val, ok := v.(json.Number); ok {
		f, _ := val.Float64()
		return f
	}
	if val, ok := v.(float64); ok {
		return val
	}
	return 0
}

func normalizeStatus(status interface{}) string {
	return strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", status)))
}

func isStatusCompleted(status interface{}) bool {
	norm := normalizeStatus(status)
	t, exists := GlobalStatusMap[norm]
	if !exists {
		// Fallback for old records or unspecified config
		return norm == "completed" || norm == "завершена" ||
			norm == "completed_return" || norm == "завершена (возврат)" ||
			norm == "completed_appeal" || norm == "завершена (апелляция)"
	}
	return t == "final"
}

func isStatusInProgress(status interface{}) bool {
	norm := normalizeStatus(status)
	t, exists := GlobalStatusMap[norm]
	if !exists {
		return norm == "in_progress" || norm == "выполняется" ||
			norm == "in_progress_return" || norm == "выполняется (возврат)"
	}
	return t == "in_progress" || t == "return"
}

func isStatusInProgressReturn(status interface{}) bool {
	norm := normalizeStatus(status)
	t, exists := GlobalStatusMap[norm]
	if !exists {
		return norm == "in_progress_return" || norm == "выполняется (возврат)"
	}
	return t == "return"
}

