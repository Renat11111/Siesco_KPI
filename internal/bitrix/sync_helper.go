package bitrix

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

func (s *SyncManager) GetMaxModifiedDate() string {
	// Ищем запись с максимальной датой модификации. 
	// В PocketBase пустые даты могут быть как "" так и "0001-01-01..."
	records, err := s.app.FindRecordsByFilter("bitrix_tasks", "bitrix_modified > '2000-01-01'", "-bitrix_modified", 1, 0, nil)
	if err == nil && len(records) > 0 {
		t := records[0].GetDateTime("bitrix_modified")
		if !t.IsZero() {
			// Возвращаем в формате PocketBase для логов, но SyncUpdates его перепарсит
			return t.String()
		}
	}
	return ""
}

// TaskCache хранит маппинг BitrixID -> PocketBase Record ID только для активных задач
type TaskCache struct {
	Active  map[string]string
}

// LoadTaskCache загружает только активные ID задач в память
func (s *SyncManager) LoadTaskCache() *TaskCache {
	log.Println("[Bitrix] Pre-loading active task IDs into memory cache...")
	cache := &TaskCache{
		Active:  make(map[string]string),
	}

	// Загружаем только из активных (их мало)
	var activeData []struct {
		Id       string `db:"id"`
		BitrixId string `db:"bitrix_id"`
	}
	errActive := s.app.DB().Select("id", "bitrix_id").From("bitrix_tasks_active").All(&activeData)
	if errActive == nil {
		for _, row := range activeData {
			cache.Active[row.BitrixId] = row.Id
		}
	}

	log.Printf("[Bitrix] Cache loaded: %d active tasks. Archive lookup will be on-demand.", len(cache.Active))
	return cache
}

// SaveTaskOptimized использует кэш для активных и точечный поиск для архива
func (s *SyncManager) SaveTaskOptimized(task BxTask, userMap map[string]string, groupMap map[string]string, archiveColl *core.Collection, activeColl *core.Collection, cache *TaskCache) {
	// 1. Save to Archive (точечный поиск по индексу вместо кэша 28к записей)
	rec, _ := s.app.FindFirstRecordByFilter(archiveColl.Id, "bitrix_id = {:bid}", map[string]interface{}{"bid": task.ID})
	
	if rec == nil {
		rec = core.NewRecord(archiveColl)
	}
	
	s.mapTaskToRecord(task, rec, userMap, groupMap)
	if err := s.app.Save(rec); err != nil {
		log.Printf("[Bitrix] Error saving task %s to archive: %v", task.ID, err)
	}

	// 2. Handle Active Tasks Cache
	isCompleted := task.Status == "5"
	pbActiveID, inActiveCache := cache.Active[task.ID]

	if isCompleted {
		if inActiveCache {
			activeRec, _ := s.app.FindRecordById(activeColl.Id, pbActiveID)
			if activeRec != nil {
				s.app.Delete(activeRec)
			}
			delete(cache.Active, task.ID)
		}
	} else {
		var activeRec *core.Record
		if inActiveCache {
			activeRec, _ = s.app.FindRecordById(activeColl.Id, pbActiveID)
		}
		if activeRec == nil {
			activeRec = core.NewRecord(activeColl)
		}
		s.mapTaskToRecord(task, activeRec, userMap, groupMap)
		if err := s.app.Save(activeRec); err != nil {
			log.Printf("[Bitrix] Error saving task %s to active cache: %v", task.ID, err)
		} else {
			cache.Active[task.ID] = activeRec.Id
		}
	}
}


func (s *SyncManager) mapTaskToRecord(t BxTask, rec *core.Record, userMap map[string]string, groupMap map[string]string) {
	rec.Set("bitrix_id", t.ID)
	rec.Set("parent_bitrix_id", t.ParentID)
	rec.Set("title", t.Title)

	desc := t.Description
	if len(desc) > 500000 {
		desc = desc[:500000]
	}
	rec.Set("description", desc)
	
	// Status needs careful handling if types differ, but Set handles basic casting
	rec.Set("status", t.Status)
	rec.Set("priority", t.Priority)
	rec.Set("comments_count", t.CommentsCount)
	rec.Set("time_estimate", t.TimeEstimate)
	rec.Set("time_spent", t.TimeSpent)

	// JSON fields
	rec.Set("accomplices", t.Accomplices)
	rec.Set("auditors", t.Auditors)
	rec.Set("tags", t.Tags)
	rec.Set("uf_crm_task", t.UfCrmTask)

	if pbId, ok := userMap[t.ResponsibleId]; ok {
		rec.Set("responsible", pbId)
	} else {
		// Log ONLY if responsible ID is set but not found mapping
		if t.ResponsibleId != "" && t.ResponsibleId != "0" {
			log.Printf("[Bitrix] Debug: Task %s has ResponsibleId '%s', but not found in userMap (len=%d)", t.ID, t.ResponsibleId, len(userMap))
		}
	}
	if pbId, ok := userMap[t.CreatedBy]; ok {
		rec.Set("created_by", pbId)
	}
	if pbId, ok := groupMap[t.GroupId]; ok {
		rec.Set("group", pbId)
	}

	// Dates
	if t.Deadline != "" {
		if dt, err := types.ParseDateTime(t.Deadline); err == nil {
			rec.Set("deadline", dt)
		}
	}
	if t.CreatedDate != "" {
		if dt, err := types.ParseDateTime(t.CreatedDate); err == nil {
			rec.Set("created_date", dt)
		}
	}
	if t.ChangedDate != "" {
		if dt, err := types.ParseDateTime(t.ChangedDate); err == nil {
			rec.Set("bitrix_modified", dt)
		}
	}
	if t.StatusChanged != "" {
		if dt, err := types.ParseDateTime(t.StatusChanged); err == nil {
			rec.Set("status_changed_date", dt)
		}
	}
	if t.StartDatePlan != "" {
		if dt, err := types.ParseDateTime(t.StartDatePlan); err == nil {
			rec.Set("start_date_plan", dt)
		}
	}
	if t.EndDatePlan != "" {
		if dt, err := types.ParseDateTime(t.EndDatePlan); err == nil {
			rec.Set("end_date_plan", dt)
		}
	}
	if t.ClosedDate != "" {
		if dt, err := types.ParseDateTime(t.ClosedDate); err == nil {
			rec.Set("closed_date", dt)
		}
	}
}