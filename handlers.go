package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func handleRanking(app *pocketbase.PocketBase, context *AppContext, e *core.RequestEvent) error {
	month := e.Request.URL.Query().Get("month")
	if month == "" || !isValidMonth(month) {
		return e.BadRequestError("Valid Month parameter is required (YYYY-MM)", nil)
	}

	start := month + "-01 00:00:00"
	end := month + "-31 23:59:59"
	response, err := streamRanking(app, start, end, context.StatusMap)
	if err != nil {
		return e.InternalServerError("Failed to calculate ranking", err)
	}
	return e.JSON(http.StatusOK, response)
}

func handleYearlyRanking(app *pocketbase.PocketBase, context *AppContext, e *core.RequestEvent) error {
	year := e.Request.URL.Query().Get("year")
	if year == "" || !isValidYear(year) {
		return e.BadRequestError("Valid Year parameter is required (YYYY)", nil)
	}

	start := year + "-01-01 00:00:00"
	end := year + "-12-31 23:59:59"

	response, err := streamRanking(app, start, end, context.StatusMap)
	if err != nil {
		return e.InternalServerError("Failed to calculate yearly stats", err)
	}
	return e.JSON(http.StatusOK, response)
}

func handleActualTasks(app *pocketbase.PocketBase, context *AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !isValidDateTime(start) || !isValidDateTime(end) {
		return e.BadRequestError("Valid Start and End dates are required", nil)
	}

	limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(e.Request.URL.Query().Get("offset"))

	records, err := fetchTasksByDateRange(app, start, end, targetUser, limit, offset)
	if err != nil {
		return e.InternalServerError("Failed to fetch tasks", err)
	}

	if len(records) >= 10000 {
		e.Response.Header().Set("X-Warning", "Results truncated (10000+ items)")
	}

	latestTasks := make(map[string]map[string]interface{})
	taskMeta := make(map[string]map[string]string) 

	for _, r := range records {
		taskList, err := parseTaskData(r.GetString(FieldData))
		if err != nil { continue }

		fileDate := r.GetString(FieldFileDate)
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
		if isStatusInProgress(task["status"], context.StatusMap) {
			if meta, exists := taskMeta[tNum]; exists {
				task["source_file_date"] = meta["source_file_date"]
				task["source_file_id"] = meta["source_file_id"]
			}
			result = append(result, task)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func handleCompletedTasksGrouped(app *pocketbase.PocketBase, context *AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !isValidDateTime(start) || !isValidDateTime(end) {
		return e.BadRequestError("Valid Start and End dates are required", nil)
	}

	limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(e.Request.URL.Query().Get("offset"))

	records, err := fetchTasksByDateRange(app, start, end, targetUser, limit, offset)
	if err != nil {
		return e.InternalServerError("Failed to fetch tasks", err)
	}

	if len(records) >= 10000 {
		e.Response.Header().Set("X-Warning", "Results truncated (10000+ items)")
	}

	type AggregatedTask struct {
		LatestData      map[string]interface{}
		TotalTimeSpent  float64
		LatestFileDate  string
		LatestFileId    string
	}

	taskMap := make(map[string]*AggregatedTask)

	for _, r := range records {
		taskList, err := parseTaskData(r.GetString(FieldData))
		if err != nil { continue }

		fileDate := r.GetString(FieldFileDate)
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
			agg.TotalTimeSpent += getTimeSpent(t["time_spent"])
			agg.LatestData = t
			agg.LatestFileDate = fileDate
			agg.LatestFileId = fileId
		}
	}

	result := []map[string]interface{}{}
	for _, agg := range taskMap {
		if isStatusCompleted(agg.LatestData["status"], context.StatusMap) {
			agg.LatestData["time_spent"] = agg.TotalTimeSpent
			agg.LatestData["source_file_date"] = agg.LatestFileDate
			agg.LatestData["source_file_id"] = agg.LatestFileId
			result = append(result, agg.LatestData)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func handleReturnedTasks(app *pocketbase.PocketBase, context *AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !isValidDateTime(start) || !isValidDateTime(end) {
		return e.BadRequestError("Valid Start and End dates are required", nil)
	}

	limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(e.Request.URL.Query().Get("offset"))

	records, err := fetchTasksByDateRange(app, start, end, targetUser, limit, offset)
	if err != nil {
		return e.InternalServerError("Failed to fetch tasks", err)
	}

	if len(records) >= 10000 {
		e.Response.Header().Set("X-Warning", "Results truncated (10000+ items)")
	}

	latestTasks := make(map[string]map[string]interface{})
	taskMeta := make(map[string]map[string]string) 

	for _, r := range records {
		taskList, err := parseTaskData(r.GetString(FieldData))
		if err != nil { continue }

		fileDate := r.GetString(FieldFileDate)
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
		if isStatusInProgressReturn(task["status"], context.StatusMap) {
			if meta, exists := taskMeta[tNum]; exists {
				task["source_file_date"] = meta["source_file_date"]
				task["source_file_id"] = meta["source_file_id"]
			}
			result = append(result, task)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func handleUpdateTaskTime(app *pocketbase.PocketBase, context *AppContext, e *core.RequestEvent) error {
	admin := e.Auth
	if admin == nil { return e.UnauthorizedError("Login required", nil) }
	if !admin.GetBool("superadmin") && !admin.GetBool("is_coordinator") {
		return e.ForbiddenError("Insufficient permissions", nil)
	}

	data := struct {
		RecordId   string  `json:"record_id"`
		TaskNumber string  `json:"task_number"`
		NewTime    float64 `json:"new_time"`
	}{}

	if err := e.BindBody(&data); err != nil { return e.BadRequestError("Invalid request body", err) }

	record, err := app.FindRecordById(CollectionTasks, data.RecordId)
	if err != nil {
		return e.NotFoundError("Task record not found", err)
	}

	// Security: Only admin/coordinator can edit, OR the user themselves if rights are expanded
	// For now, it's admin-only, but let's ensure they don't break logic.
	// Non-superadmins should only edit their own records (if allowed).
	if !admin.GetBool("superadmin") && record.GetString(FieldUser) != admin.Id {
		return e.ForbiddenError("Access denied: you can only edit your own tasks", nil)
	}

	// Double check that it's actually from the tasks collection
	if record.Collection().Name != CollectionTasks {
		return e.ForbiddenError("Invalid record collection", nil)
	}

	taskList, err := parseTaskData(record.GetString(FieldData))
	if err != nil { return e.InternalServerError("Failed to parse task data", err) }

	found, updated := false, false
	for i, t := range taskList {
		if fmt.Sprintf("%v", t["task_number"]) == data.TaskNumber {
			found = true
			currentTime := getTimeSpent(t["time_spent"])
			if currentTime != data.NewTime {
				updated = true
				alreadyEdited, _ := t["is_edited"].(bool)
				if !alreadyEdited { t["original_time_spent"] = currentTime }
				t["time_spent"] = data.NewTime
				t["is_edited"] = true
				taskList[i] = t 
			}
			break
		}
	}

	if !found { return e.NotFoundError("Task not found", nil) }
	if updated {
		newJsonBytes, err := json.Marshal(taskList)
		if err != nil { return e.InternalServerError("Serialization failed", err) }
		record.Set(FieldData, string(newJsonBytes))
		if err := app.Save(record); err != nil { return err }
	}
	return e.JSON(http.StatusOK, map[string]interface{}{"success": true, "updated": updated})
}
