package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"my_pocketbase_app/internal/app"
	"my_pocketbase_app/internal/utils"
)

func HandleRanking(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	month := e.Request.URL.Query().Get("month")
	if month == "" || !utils.IsValidMonth(month) {
		return e.BadRequestError("Valid Month parameter is required (YYYY-MM)", nil)
	}
	start := month + "-01 00:00:00"
	end := month + "-31 23:59:59"
	response, err := utils.StreamRanking(pbApp, start, end, context.StatusMap)
	if err != nil {
		return e.InternalServerError("Failed to calculate ranking", err)
	}
	return e.JSON(http.StatusOK, response)
}

func HandleYearlyRanking(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	year := e.Request.URL.Query().Get("year")
	if year == "" || !utils.IsValidYear(year) {
		return e.BadRequestError("Valid Year parameter is required (YYYY)", nil)
	}
	start := year + "-01-01 00:00:00"
	end := year + "-12-31 23:59:59"
	response, err := utils.StreamRanking(pbApp, start, end, context.StatusMap)
	if err != nil {
		return e.InternalServerError("Failed to calculate yearly stats", err)
	}
	return e.JSON(http.StatusOK, response)
}

func HandleActualTasks(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !utils.IsValidDateTime(start) || !utils.IsValidDateTime(end) {
		return e.BadRequestError("Valid dates required", nil)
	}

	records, _ := utils.FetchTasksByDateRange(pbApp, start, end, targetUser, 0, 0)
	utils.SortRecordsChronologically(records)

	latestTasks := make(map[string]app.TaskEntry)
	for _, r := range records {
		taskList, _ := utils.ParseTaskData(r.GetString(app.FieldData))
		for _, t := range taskList {
			taskNum := strings.TrimSpace(fmt.Sprintf("%v", t["task_number"]))
			if taskNum == "" { continue }
			t["source_file_date"] = r.GetString("file_date")
			t["source_file_id"] = r.Id
			latestTasks[taskNum] = t
		}
	}

	result := []app.TaskEntry{}
	for _, t := range latestTasks {
		if !utils.IsStatusCompleted(t["status"], context.StatusMap) {
			result = append(result, t)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func HandleCompletedTasksGrouped(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !utils.IsValidDateTime(start) || !utils.IsValidDateTime(end) {
		return e.BadRequestError("Valid dates required", nil)
	}

	records, _ := utils.FetchTasksByDateRange(pbApp, start, end, targetUser, 0, 0)
	utils.SortRecordsChronologically(records)

	var totalMonthSpent, totalMonthEval float64
	taskHistorySumSpent := make(map[string]float64)
	taskHistorySumEval := make(map[string]float64)
	taskLatestData := make(map[string]app.TaskEntry)

	// 1. Считаем АБСОЛЮТНО ВСЕ часы месяца (как в Ranking)
	for _, r := range records {
		taskList, _ := utils.ParseTaskData(r.GetString(app.FieldData))
		for _, t := range taskList {
			taskNum := strings.TrimSpace(fmt.Sprintf("%v", t["task_number"]))
			if taskNum == "" { continue }

			spent := utils.GetTimeSpent(t["time_spent"])
			eval := utils.GetTimeSpent(t["programmer_estimate"])

			totalMonthSpent += spent
			totalMonthEval += eval
			
			taskHistorySumSpent[taskNum] += spent
			taskHistorySumEval[taskNum] += eval
			
			t["source_file_date"] = r.GetString("file_date")
			t["source_file_id"] = r.Id
			taskLatestData[taskNum] = t
		}
	}

	// 2. Считаем, сколько из этого - текущие "активные" остатки
	var activeLatestSpent, activeLatestEval float64
	for _, t := range taskLatestData {
		if !utils.IsStatusCompleted(t["status"], context.StatusMap) {
			activeLatestSpent += utils.GetTimeSpent(t["time_spent"])
			activeLatestEval += utils.GetTimeSpent(t["programmer_estimate"])
		}
	}

	// 3. Целевой итог завершенных = Весь месяц - Активные (последние)
	targetSpent := totalMonthSpent - activeLatestSpent
	targetEval := totalMonthEval - activeLatestEval

	result := []app.TaskEntry{}
	var currentResultSpent, currentResultEval float64

	// 4. Формируем список реально завершенных задач
	for _, t := range taskLatestData {
		if utils.IsStatusCompleted(t["status"], context.StatusMap) {
			taskNumKey := strings.TrimSpace(fmt.Sprintf("%v", t["task_number"]))
			t["time_spent"] = taskHistorySumSpent[taskNumKey]
			t["programmer_estimate"] = taskHistorySumEval[taskNumKey]
			result = append(result, t)
			currentResultSpent += taskHistorySumSpent[taskNumKey]
			currentResultEval += taskHistorySumEval[taskNumKey]
		}
	}

	// 5. Добавляем корректирующую строку (история активных задач)
	// Это те "куски" времени, которые были потрачены на задачи, которые всё еще в работе.
	// Они завершены как этапы, поэтому должны быть в этом списке.
	diffSpent := targetSpent - currentResultSpent
	diffEval := targetEval - currentResultEval

	if diffSpent > 0.01 || diffEval > 0.01 {
		result = append(result, app.TaskEntry{
			"task_number": "HIST-ADJ",
			"project":     "SYSTEM",
			"description": "Завершенные этапы активных задач (История)",
			"status":      "Завершена",
			"time_spent":  diffSpent,
			"programmer_estimate": diffEval,
			"date":        end[:10],
		})
	}

	log.Printf("[DEBUG] Math: Total=%.2f, ActiveLatest=%.2f, TargetCompleted=%.2f, ResultSum=%.2f", totalMonthSpent, activeLatestSpent, targetSpent, targetSpent)
	return e.JSON(http.StatusOK, result)
}

func HandleReturnedTasks(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	targetUser := e.Request.URL.Query().Get("user")

	if start == "" || end == "" || !utils.IsValidDateTime(start) || !utils.IsValidDateTime(end) {
		return e.BadRequestError("Valid Start and End dates are required", nil)
	}

	records, _ := utils.FetchTasksByDateRange(pbApp, start, end, targetUser, 0, 0)
	utils.SortRecordsChronologically(records)

	latestTasks := make(map[string]app.TaskEntry)
	for _, r := range records {
		taskList, _ := utils.ParseTaskData(r.GetString(app.FieldData))
		for _, t := range taskList {
			taskNum := strings.TrimSpace(fmt.Sprintf("%v", t["task_number"]))
			if taskNum == "" { continue }
			t["source_file_date"] = r.GetString("file_date")
			t["source_file_id"] = r.Id
			latestTasks[taskNum] = t
		}
	}

	result := []app.TaskEntry{}
	for _, t := range latestTasks {
		if utils.IsStatusInProgressReturn(t["status"], context.StatusMap) {
			result = append(result, t)
		}
	}
	return e.JSON(http.StatusOK, result)
}

func HandleUpdateTaskTime(pbApp *pocketbase.PocketBase, context *app.AppContext, e *core.RequestEvent) error {
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

	if err := e.BindBody(&data); err != nil { return e.BadRequestError("Invalid body", err) }

	record, err := pbApp.FindRecordById(app.CollectionTasks, data.RecordId)
	if err != nil { return e.NotFoundError("Not found", err) }

	taskList, _ := utils.ParseTaskData(record.GetString(app.FieldData))
	found := false
	        for i, t := range taskList {
	            if strings.TrimSpace(fmt.Sprintf("%v", t["task_number"])) == data.TaskNumber {
	                found = true
	                
	                // Получаем текущие значения
	                currTime := 0.0
	                switch v := t["time_spent"].(type) {
	                case float64: currTime = v
	                case int: currTime = float64(v)
	                }
	    
	                // Если оригинал еще не сохранен (даже если флаг редактирования стоит)
	                orig, exists := t["original_time_spent"]
	                if !exists || orig == nil || orig == 0.0 {
	                    t["original_time_spent"] = t["time_spent"]
	                }
	    
	                t["time_spent"] = data.NewTime
	                t["is_edited"] = true
	                taskList[i] = t
	                
	                log.Printf("[TaskEdit] Task %s: Original=%.2f, New=%.2f", data.TaskNumber, currTime, data.NewTime)
	                break
	            }
	        }
	    
		if found {
		newJson, _ := json.Marshal(taskList)
		record.Set(app.FieldData, string(newJson))
		pbApp.Save(record)
	}
	return e.JSON(http.StatusOK, map[string]interface{}{"success": found})
}