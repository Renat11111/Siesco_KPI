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

func main() {
	app := pocketbase.New()
	appContext := &AppContext{
		StatusMap: make(map[string]string),
	}

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/hello", func(e *core.RequestEvent) error {
			return e.String(200, "Hello world!")
		})

		e.Router.GET("/api/kpi/ranking", func(e *core.RequestEvent) error {
			return handleRanking(app, appContext, e)
		})

		e.Router.GET("/api/kpi/yearly-ranking", func(e *core.RequestEvent) error {
			return handleYearlyRanking(app, appContext, e)
		})

		e.Router.GET("/api/kpi/actual-tasks", func(e *core.RequestEvent) error {
			return handleActualTasks(app, appContext, e)
		})

		e.Router.GET("/api/kpi/completed-tasks-grouped", func(e *core.RequestEvent) error {
			return handleCompletedTasksGrouped(app, appContext, e)
		})

		e.Router.GET("/api/kpi/returned-tasks", func(e *core.RequestEvent) error {
			return handleReturnedTasks(app, appContext, e)
		})

		e.Router.POST("/api/kpi/update-task-time", func(e *core.RequestEvent) error {
			return handleUpdateTaskTime(app, appContext, e)
		})

		// --- HOOK: Leave Request Security & Notification ---
		app.OnRecordCreateRequest("leave_requests").BindFunc(func(e *core.RecordRequestEvent) error {
			if e.Auth != nil {
				e.Record.Set("user", e.Auth.Id)
			}

			// 1. Проверка пересечения дат (Критическая уязвимость)
			newStart := e.Record.GetString("start_date")
			newEnd := e.Record.GetString("end_date")
			userId := e.Record.GetString("user")

			existing, err := app.FindRecordsByFilter(
				"leave_requests",
				"user = {:user} && status != 'rejected' && start_date <= {:newEnd} && end_date >= {:newStart}",
				"",
				1, 0,
				map[string]interface{}{
					"user":     userId,
					"newStart": newStart,
					"newEnd":   newEnd,
				},
			)
			if err != nil { return fmt.Errorf("failed to check for overlaps: %w", err) }
			if len(existing) > 0 {
				return e.BadRequestError("You already have an active leave request for this period", nil)
			}

			// 2. Сначала сохраняем запись
			if err := e.Next(); err != nil {
				return err
			}

			// 3. Копируем данные для фоновой задачи (Изоляция от Race Condition)
			// Это критически важно: горутина должна работать с копией, а не с e.Record
			reasonCopy := e.Record.GetString("reason")
			userIdCopy := userId // уже извлечен выше

			// Отправка уведомлений в фоне
			go func(reason, uid string) {
				userName := "Unknown"
				userRecord, _ := app.FindRecordById("users", uid)
				if userRecord != nil {
					userName = userRecord.GetString("name")
				}

				admins, err := app.FindRecordsByFilter("users", "superadmin=true || is_coordinator=true", "", 100, 0, nil)
				if err != nil || len(admins) == 0 { return }

				subject := fmt.Sprintf("New Leave Request from %s", userName)
				body := fmt.Sprintf(`<h3>New Leave Request</h3><p><strong>User:</strong> %s</p><p><strong>Reason:</strong> %s</p>`, 
					userName, reason)

				senderAddress := app.Settings().Meta.SenderAddress
				senderName := app.Settings().Meta.SenderName
				
				mailClient := app.NewMailClient()
				for _, admin := range admins {
					email := admin.GetString("email")
					if email == "" { continue }
					message := &mailer.Message{
						From:    mail.Address{Address: senderAddress, Name: senderName},
						To:      []mail.Address{{Address: email}},
						Subject: subject,
						HTML:    body,
					}
					mailClient.Send(message)
				}
			}(reasonCopy, userIdCopy)

			return nil
		})

		if err := bootstrapCollections(app, appContext); err != nil {
			log.Fatalf("CRITICAL: Bootstrap failed: %v", err)
		}

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func bootstrapCollections(app *pocketbase.PocketBase, context *AppContext) error {
	var err error
	var leaveReqs *core.Collection

	log.Println("Initializing collections...")

	// --- 1. Модификация коллекции Users ---
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return fmt.Errorf("failed to find users collection: %w", err)
	}

	targetRule := "@request.auth.id != ''"
	if users.ListRule == nil || *users.ListRule != targetRule {
		log.Println("Updating Users collection API rules...")
		users.ListRule = types.Pointer(targetRule)
		users.ViewRule = types.Pointer(targetRule)
		if err := app.Save(users); err != nil {
			return fmt.Errorf("failed to update users rules: %w", err)
		}
	}

	if users.Fields.GetByName("superadmin") == nil {
		log.Println("Adding 'superadmin' field to users...")
		users.Fields.Add(&core.BoolField{ Name: "superadmin" })
		if err := app.Save(users); err != nil { return fmt.Errorf("failed to add superadmin field: %w", err) }
	}

	if users.Fields.GetByName("is_coordinator") == nil {
		log.Println("Adding 'is_coordinator' field to users...")
		users.Fields.Add(&core.BoolField{ Name: "is_coordinator" })
		if err := app.Save(users); err != nil { return fmt.Errorf("failed to add coordinator field: %w", err) }
	}

	// --- 1.1 Create/Update 'leave_requests' collection ---
	leaveReqs, err = app.FindCollectionByNameOrId("leave_requests")
	if err != nil {
		log.Println("Creating 'leave_requests' collection...")
		leaveReqs = core.NewBaseCollection("leave_requests")
		if err := app.Save(leaveReqs); err != nil { return fmt.Errorf("failed to create leave_requests: %w", err) }
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
	if err := app.Save(leaveReqs); err != nil { return fmt.Errorf("failed to save leave_requests: %w", err) }

	// --- 2. Создание/Обновление коллекции Tasks ---
	log.Println("Checking Tasks collection...")
	tasksCollection, err := app.FindCollectionByNameOrId(CollectionTasks)
	if err != nil {
		log.Println("Creating 'tasks' collection...")
		tasksCollection = core.NewBaseCollection(CollectionTasks)
		
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
			Name:     FieldData,
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
		if !exists { 
			log.Printf("Adding index %s to Tasks...", idx.Name)
			tasksCollection.AddIndex(idx.Name, idx.Unique, idx.Columns, "") 
		}
	}

	if err := app.Save(tasksCollection); err != nil { return fmt.Errorf("failed to save tasks collection: %w", err) }

	// --- 2.1 Создание коллекции 'deletion_logs' ---
	log.Println("Checking Log collections...")
	deletionLogs, err := app.FindCollectionByNameOrId("deletion_logs")
	if err != nil {
		deletionLogs = core.NewBaseCollection("deletion_logs")
		deletionLogs.ListRule = types.Pointer("@request.auth.superadmin = true")
		deletionLogs.CreateRule = types.Pointer("@request.auth.superadmin = true") // Fix: Allow creation
		deletionLogs.Fields.Add(&core.TextField{Name: "file_name", Required: true})
		deletionLogs.Fields.Add(&core.TextField{Name: "reason", Required: true})
		deletionLogs.Fields.Add(&core.RelationField{ Name: "deleted_by", CollectionId: users.Id, MaxSelect: 1 })
		deletionLogs.Fields.Add(&core.FileField{ Name: "excel_file", MaxSelect: 1, MimeTypes: []string{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel"}})
		deletionLogs.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		if err := app.Save(deletionLogs); err != nil { return fmt.Errorf("failed to create deletion_logs: %w", err) }
	} else {
		// Update existing rule if needed
		if deletionLogs.CreateRule == nil || *deletionLogs.CreateRule != "@request.auth.superadmin = true" {
			deletionLogs.CreateRule = types.Pointer("@request.auth.superadmin = true")
			app.Save(deletionLogs)
		}
	}

	// --- 2.2 Создание коллекции 'upload_logs' ---
	uploadLogs, err := app.FindCollectionByNameOrId("upload_logs")
	if err != nil {
		uploadLogs = core.NewBaseCollection("upload_logs")
		uploadLogs.ListRule = types.Pointer("@request.auth.superadmin = true")
		uploadLogs.CreateRule = types.Pointer("@request.auth.superadmin = true") // Fix: Allow creation
		uploadLogs.Fields.Add(&core.TextField{Name: "file_name", Required: true})
		uploadLogs.Fields.Add(&core.RelationField{Name: "uploaded_by", CollectionId: users.Id, MaxSelect: 1})
		uploadLogs.Fields.Add(&core.RelationField{Name: "target_user", CollectionId: users.Id, MaxSelect: 1})
		uploadLogs.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		if err := app.Save(uploadLogs); err != nil { return fmt.Errorf("failed to create upload_logs: %w", err) }
	} else {
		// Update existing rule
		if uploadLogs.CreateRule == nil || *uploadLogs.CreateRule != "@request.auth.superadmin = true" {
			uploadLogs.CreateRule = types.Pointer("@request.auth.superadmin = true")
			app.Save(uploadLogs)
		}
	}

	// --- 3. Чтение config.json ---
	log.Println("Syncing config.json...")
	configFile, err := os.Open("config.json")
	if err != nil {
		log.Fatalf("CRITICAL: config.json not found or could not be opened: %v", err)
	}
	defer configFile.Close()

	bytes, err := io.ReadAll(configFile)
	if err != nil {
		log.Fatalf("CRITICAL: Failed to read config.json: %v", err)
	}

	var appConfig AppConfig
	if err := json.Unmarshal(bytes, &appConfig); err != nil {
		log.Fatalf("CRITICAL: Failed to parse config.json: %v", err)
	}

	if len(appConfig.Statuses) == 0 {
		log.Fatal("CRITICAL: config.json must contain at least one status")
	}

	// Populate context map with both Slug and Title for flexible lookup
	for _, s := range appConfig.Statuses {
		context.StatusMap[strings.ToLower(strings.TrimSpace(s.Slug))] = s.Type
		context.StatusMap[strings.ToLower(strings.TrimSpace(s.Title))] = s.Type
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
			return fmt.Errorf("failed to create statuses: %w", err)
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
			return fmt.Errorf("failed to create task_fields: %w", err)
		}

		// Populate initial task_fields
		for i, f := range appConfig.TaskFields {
			record := core.NewRecord(fieldsCollection)
			record.Set("key", f.Key); record.Set("title", f.Title); record.Set("type", f.Type); record.Set("required", f.Required); record.Set("width", f.Width); record.Set("filterable", f.Filterable); record.Set("order", i)
			app.Save(record)
		}
	}

	// --- 6. View Collection 'monthly_user_stats' ---
	log.Println("Checking View collections...")
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
		if err := app.Save(monthlyStats); err != nil {
			return fmt.Errorf("failed to create monthly view: %w", err)
		}
	}

	// --- 7. Signaling Collection 'ranking_updates' (Realtime Broadcast) ---
	rankingUpdates, err := app.FindCollectionByNameOrId("ranking_updates")
	if err != nil {
		rankingUpdates = core.NewBaseCollection("ranking_updates")
		// Allow everyone to read (subscribe), allow everyone to create (to be safe)
		rankingUpdates.ListRule = types.Pointer("@request.auth.id != ''")
		rankingUpdates.ViewRule = types.Pointer("@request.auth.id != ''")
		rankingUpdates.CreateRule = types.Pointer("@request.auth.id != ''") 
		if err := app.Save(rankingUpdates); err != nil { return fmt.Errorf("failed to create ranking_updates: %w", err) }
	}

	// --- 8. Hooks for Realtime Signaling (Optimized) ---
	// Reuse a single record to keep DB clean. Update triggers 'update' event which works for subscribers.
	triggerSignal := func() {
		collection, _ := app.FindCollectionByNameOrId("ranking_updates")
		if collection == nil { return }

		// Try to find ANY existing record
		record, _ := app.FindFirstRecordByFilter("ranking_updates", "id != ''")
		if record == nil {
			// Create first signal record if empty
			record = core.NewRecord(collection)
		}
		// Saving updates the 'updated' timestamp, triggering the realtime event
		app.Save(record)
	}

	app.OnRecordAfterCreateSuccess("tasks").BindFunc(func(e *core.RecordEvent) error {
		triggerSignal()
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess("tasks").BindFunc(func(e *core.RecordEvent) error {
		triggerSignal()
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess("tasks").BindFunc(func(e *core.RecordEvent) error {
		triggerSignal()
		return e.Next()
	})

	return nil
}