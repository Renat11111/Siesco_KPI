package bitrix

import (
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// SyncUpdates выполняет инкрементальную синхронизацию задач
func (s *SyncManager) SyncUpdates() error {
	lastDateStr := s.GetMaxModifiedDate()
	if lastDateStr == "" {
		log.Println("[Bitrix] No modified date found (first run?), running full sync...")
		return s.SyncTasks()
	}

	// Парсим и форматируем дату для Битрикса (ISO 8601 без Z или локальный)
	// PB: 2006-01-02 15:04:05.000Z
	t, err := time.Parse("2006-01-02 15:04:05.000Z", lastDateStr)
	if err != nil {
		log.Printf("[Bitrix] Error parsing date '%s': %v. Fallback to full sync.", lastDateStr, err)
		return s.SyncTasks()
	}

	// Битрикс понимает ATOM/ISO. 
	// Использование +1 секунда опасно, можно пропустить задачи в ту же секунду.
	// Используем окно в -5 минут для надежности. Дубликаты просто обновятся.
	filterDate := t.Add(-5 * time.Minute).Format(time.RFC3339)

	log.Printf("[Bitrix] Checking updates since %s (with 5m safety window)...", filterDate)
	
	collection, _ := s.app.FindCollectionByNameOrId("bitrix_tasks")
	activeCollection, _ := s.app.FindCollectionByNameOrId("bitrix_tasks_active")
	
	// Кэшируем пользователей и группы для связей
	userMap := make(map[string]string)
	users, _ := s.app.FindRecordsByFilter("bitrix_users", "id != ''", "", 2000, 0, nil)
	for _, u := range users {
		bxID := u.Get("bitrix_id")
		userMap[fmt.Sprint(bxID)] = u.Id
	}

	groupMap := make(map[string]string)
	groups, _ := s.app.FindRecordsByFilter("bitrix_groups", "id != ''", "", 2000, 0, nil)
	for _, g := range groups {
		bxID := g.Get("bitrix_id")
		groupMap[fmt.Sprint(bxID)] = g.Id
	}

	cache := s.LoadTaskCache()
	start := 0
	totalUpdated := 0
	updatedIDs := []string{}

	for {
		resp, err := s.call("tasks.task.list", map[string]interface{}{
			"start":  start,
			"filter": map[string]interface{}{">CHANGED_DATE": filterDate},
			"select": []string{"id", "parentId", "title", "description", "status", "responsibleId", "createdBy", "groupId", "deadline", "changedDate", "statusChangedDate", "priority", "createdDate", "commentsCount", "timeEstimate", "timeSpentInLogs", "startDatePlan", "endDatePlan", "closedDate", "accomplices", "auditors", "tags", "ufCrmTask"},
		})
		if err != nil {
			return err
		}

		var data BxResponse[struct {
			Tasks []BxTask `json:"tasks"`
		}]
		if err := json.Unmarshal(resp, &data); err != nil {
			log.Printf("[Bitrix] JSON parse error: %v", err)
			return err
		}

		if len(data.Result.Tasks) == 0 {
			break
		}

		for _, task := range data.Result.Tasks {
			s.SaveTaskOptimized(task, userMap, groupMap, collection, activeCollection, cache)
			totalUpdated++
			updatedIDs = append(updatedIDs, task.ID)
		}

		if data.Next == 0 {
			break
		}
		start = data.Next
		time.Sleep(100 * time.Millisecond)
	}

	if totalUpdated > 0 {
		log.Printf("[Bitrix] Incremental sync finished. Updated: %d tasks (%v).", totalUpdated, updatedIDs)
	} else {
		log.Println("[Bitrix] No new updates found.")
	}
	return nil
}
