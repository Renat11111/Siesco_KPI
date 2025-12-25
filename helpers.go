package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func isValidYear(year string) bool {
	_, err := time.Parse("2006", year)
	return err == nil
}

func isValidMonth(month string) bool {
	_, err := time.Parse("2006-01", month)
	return err == nil
}

func isValidDateTime(dt string) bool {
	// Try standard PocketBase format first
	if _, err := time.Parse("2006-01-02 15:04:05", dt); err == nil {
		return true
	}
	// Try ISO8601/RFC3339 just in case
	if _, err := time.Parse(time.RFC3339, dt); err == nil {
		return true
	}
	// Also try simple date (YYYY-MM-DD) which is often passed as start/end
	if _, err := time.Parse("2006-01-02", dt); err == nil {
		return true
	}
	return false
}

func fetchTasksByDateRange(app *pocketbase.PocketBase, start, end, targetUser string, limit, offset int) ([]*core.Record, error) {
	filter := "file_date >= {:start} && file_date <= {:end}"
	params := map[string]interface{}{"start": start, "end": end}

	if targetUser != "" {
		filter += " && user = {:user}"
		params["user"] = targetUser
	}

	if limit <= 0 {
		limit = 10000 // Default high limit for backward compatibility
	}

	return app.FindRecordsByFilter("tasks", filter, "+file_date", limit, offset, params)
}

func streamRanking(app *pocketbase.PocketBase, start, end string, statusMap map[string]string) (interface{}, error) {
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
			if isStatusCompleted(status, statusMap) {
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

func isStatusCompleted(status interface{}, statusMap map[string]string) bool {
	norm := normalizeStatus(status)
	t, exists := statusMap[norm]
	if !exists {
		// Fallback for old records or unspecified config
		return norm == "completed" || norm == "завершена" ||
			norm == "completed_return" || norm == "завершена (возврат)" ||
			norm == "completed_appeal" || norm == "завершена (апелляция)"
	}
	return t == "final"
}

func isStatusInProgress(status interface{}, statusMap map[string]string) bool {
	norm := normalizeStatus(status)
	t, exists := statusMap[norm]
	if !exists {
		return norm == "in_progress" || norm == "выполняется" ||
			norm == "in_progress_return" || norm == "выполняется (возврат)"
	}
	return t == "in_progress" || t == "return"
}

func isStatusInProgressReturn(status interface{}, statusMap map[string]string) bool {
	norm := normalizeStatus(status)
	t, exists := statusMap[norm]
	if !exists {
		return norm == "in_progress_return" || norm == "выполняется (возврат)"
	}
	return t == "return"
}
