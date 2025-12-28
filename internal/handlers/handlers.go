package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"my_pocketbase_app/internal/app"
	"my_pocketbase_app/internal/utils"
)

func HandleRanking(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	month := e.Request.URL.Query().Get("month")
	if month == "" || !utils.IsValidMonth(month) {
		log.Printf("[WARN] HandleRanking: missing or invalid month: %q", month)
		return e.BadRequestError("Valid Month parameter is required (YYYY-MM)", nil)
	}

	start := month + "-01 00:00:00"
	end := month + "-31 23:59:59"
	response, err := utils.StreamRanking(pbApp, start, end, context.StatusMap)
	if err != nil {
		log.Printf("[ERROR] HandleRanking: calculation failed: %v", err)
		return e.InternalServerError("Failed to calculate ranking", err)
	}
	return e.JSON(http.StatusOK, response)
}

func HandleYearlyRanking(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	year := e.Request.URL.Query().Get("year")
	if year == "" || !utils.IsValidYear(year) {
		log.Printf("[WARN] HandleYearlyRanking: missing or invalid year: %q", year)
		return e.BadRequestError("Valid Year parameter is required (YYYY)", nil)
	}

	start := year + "-01-01 00:00:00"
	end := year + "-12-31 23:59:59"

	response, err := utils.StreamRanking(pbApp, start, end, context.StatusMap)
	if err != nil {
		log.Printf("[ERROR] HandleYearlyRanking: calculation failed: %v", err)
		return e.InternalServerError("Failed to calculate yearly stats", err)
	}
	return e.JSON(http.StatusOK, response)
}

func HandleActualTasks(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !utils.IsValidDateTime(start) || !utils.IsValidDateTime(end) {
		log.Printf("[WARN] HandleActualTasks: invalid date parameters start=%q, end=%q", start, end)
		return e.BadRequestError("Valid Start and End dates are required", nil)
	}

	limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(e.Request.URL.Query().Get("offset"))

	records, err := utils.FetchTasksByDateRange(pbApp, start, end, targetUser, limit, offset)
	if err != nil {
		log.Printf("[ERROR] HandleActualTasks: db fetch failed: %v", err)
		return e.InternalServerError("Failed to fetch tasks", err)
	}

	if len(records) >= 10000 {
		e.Response.Header().Set("X-Warning", "Results truncated (10000+ items)")
	}

	latestTasks := make(map[string]app.TaskEntry)

	for _, r := range records {
		taskList, err := utils.ParseTaskData(r.GetString(app.FieldData))
		if err != nil {
			log.Printf("[ERROR] HandleActualTasks: parse data error for record %s: %v", r.Id, err)
			continue
		}

		fileDate := r.GetString(app.FieldFileDate)
		fileId := r.Id

		for _, t := range taskList {
			taskNum := fmt.Sprintf("%v", t["task_number"])
			if taskNum == "" {
				continue
			}

			t["source_file_date"] = fileDate
			t["source_file_id"] = fileId
			latestTasks[taskNum] = t
		}
	}

	result := []app.TaskEntry{}
	for _, task := range latestTasks {
		if utils.IsStatusInProgress(task["status"], context.StatusMap) {
			result = append(result, task)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func HandleCompletedTasksGrouped(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !utils.IsValidDateTime(start) || !utils.IsValidDateTime(end) {
		log.Printf("[WARN] HandleCompletedTasksGrouped: invalid date parameters start=%q, end=%q", start, end)
		return e.BadRequestError("Valid Start and End dates are required", nil)
	}

	limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(e.Request.URL.Query().Get("offset"))

	records, err := utils.FetchTasksByDateRange(pbApp, start, end, targetUser, limit, offset)
	if err != nil {
		log.Printf("[ERROR] HandleCompletedTasksGrouped: db fetch failed: %v", err)
		return e.InternalServerError("Failed to fetch tasks", err)
	}

	if len(records) >= 10000 {
		e.Response.Header().Set("X-Warning", "Results truncated (10000+ items)")
	}

	type AggregatedTask struct {
		LatestData     app.TaskEntry
		TotalTimeSpent float64
	}

	taskMap := make(map[string]*AggregatedTask)

	for _, r := range records {
		taskList, err := utils.ParseTaskData(r.GetString(app.FieldData))
		if err != nil {
			continue
		}

		fileDate := r.GetString(app.FieldFileDate)
		fileId := r.Id

		for _, t := range taskList {
			taskNumStr := fmt.Sprintf("%v", t["task_number"])
			if taskNumStr == "" {
				continue
			}

			if _, exists := taskMap[taskNumStr]; !exists {
				taskMap[taskNumStr] = &AggregatedTask{
					LatestData:     t,
					TotalTimeSpent: 0,
				}
			}

			agg := taskMap[taskNumStr]
			agg.TotalTimeSpent += utils.GetTimeSpent(t["time_spent"])
			t["source_file_date"] = fileDate
			t["source_file_id"] = fileId
			agg.LatestData = t
		}
	}

	result := []app.TaskEntry{}
	for _, agg := range taskMap {
		if utils.IsStatusCompleted(agg.LatestData["status"], context.StatusMap) {
			agg.LatestData["time_spent"] = agg.TotalTimeSpent
			result = append(result, agg.LatestData)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func HandleReturnedTasks(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !utils.IsValidDateTime(start) || !utils.IsValidDateTime(end) {
		log.Printf("[WARN] HandleReturnedTasks: invalid date parameters start=%q, end=%q", start, end)
		return e.BadRequestError("Valid Start and End dates are required", nil)
	}

	limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(e.Request.URL.Query().Get("offset"))

	records, err := utils.FetchTasksByDateRange(pbApp, start, end, targetUser, limit, offset)
	if err != nil {
		log.Printf("[ERROR] HandleReturnedTasks: db fetch failed: %v", err)
		return e.InternalServerError("Failed to fetch tasks", err)
	}

	if len(records) >= 10000 {
		e.Response.Header().Set("X-Warning", "Results truncated (10000+ items)")
	}

	latestTasks := make(map[string]app.TaskEntry)

	for _, r := range records {
		taskList, err := utils.ParseTaskData(r.GetString(app.FieldData))
		if err != nil {
			log.Printf("[ERROR] HandleReturnedTasks: parse data error for record %s: %v", r.Id, err)
			continue
		}

		fileDate := r.GetString(app.FieldFileDate)
		fileId := r.Id

		for _, t := range taskList {
			taskNum := fmt.Sprintf("%v", t["task_number"])
			if taskNum == "" {
				continue
			}

			t["source_file_date"] = fileDate
			t["source_file_id"] = fileId
			latestTasks[taskNum] = t
		}
	}

	result := []app.TaskEntry{}
	for _, task := range latestTasks {
		if utils.IsStatusInProgressReturn(task["status"], context.StatusMap) {
			result = append(result, task)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func HandleUpdateTaskTime(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	admin := e.Auth
	if admin == nil {
		return e.UnauthorizedError("Login required", nil)
	}
	if !admin.GetBool("superadmin") && !admin.GetBool("is_coordinator") {
		return e.ForbiddenError("Insufficient permissions", nil)
	}

	data := struct {
		RecordId   string  `json:"record_id"`
		TaskNumber string  `json:"task_number"`
		NewTime    float64 `json:"new_time"`
	}{}

	if err := e.BindBody(&data); err != nil {
		log.Printf("[WARN] HandleUpdateTaskTime: invalid body: %v", err)
		return e.BadRequestError("Invalid request body", err)
	}

	record, err := pbApp.FindRecordById(app.CollectionTasks, data.RecordId)
	if err != nil {
		log.Printf("[ERROR] HandleUpdateTaskTime: record %s not found: %v", data.RecordId, err)
		return e.NotFoundError("Task record not found", err)
	}

	// Double check that it's actually from the tasks collection
	if record.Collection().Name != app.CollectionTasks {
		return e.ForbiddenError("Invalid record collection", nil)
	}

	// Security check
	if !admin.GetBool("superadmin") && record.GetString(app.FieldUser) != admin.Id {
		log.Printf("[WARN] HandleUpdateTaskTime: user %s tried to edit task of user %s", admin.Id, record.GetString(app.FieldUser))
		return e.ForbiddenError("Access denied: you can only edit your own tasks", nil)
	}

	taskList, err := utils.ParseTaskData(record.GetString(app.FieldData))
	if err != nil {
		log.Printf("[ERROR] HandleUpdateTaskTime: parse error for record %s: %v", data.RecordId, err)
		return e.InternalServerError("Failed to parse task data", err)
	}

	found, updated := false, false
	for i, t := range taskList {
		if fmt.Sprintf("%v", t["task_number"]) == data.TaskNumber {
			found = true
			currentTime := utils.GetTimeSpent(t["time_spent"])
			if currentTime != data.NewTime {
				updated = true
				alreadyEdited, _ := t["is_edited"].(bool)
				if !alreadyEdited {
					t["original_time_spent"] = t["time_spent"]
				}
				t["time_spent"] = data.NewTime
				t["is_edited"] = true
				taskList[i] = t
			}
			break
		}
	}

	if !found {
		log.Printf("[WARN] HandleUpdateTaskTime: task %s not found in record %s", data.TaskNumber, data.RecordId)
		return e.NotFoundError("Task not found", nil)
	}
	if updated {
		newJsonBytes, err := json.Marshal(taskList)
		if err != nil {
			return e.InternalServerError("Serialization failed", err)
		}
		record.Set(app.FieldData, string(newJsonBytes))
		if err := pbApp.Save(record); err != nil {
			log.Printf("[ERROR] HandleUpdateTaskTime: save failed for record %s: %v", data.RecordId, err)
			return err
		}
		log.Printf("[INFO] HandleUpdateTaskTime: task %s updated in record %s by user %s", data.TaskNumber, data.RecordId, admin.Id)
	}
	return e.JSON(http.StatusOK, map[string]interface{}{"success": true, "updated": updated})
}
