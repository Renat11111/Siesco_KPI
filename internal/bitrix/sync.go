package bitrix

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// SyncManager управляет процессом синхронизации с Bitrix24
type SyncManager struct {
	app        core.App
	webhookURL string
}

func NewSyncManager(app core.App) *SyncManager {
	url := ""
	record, err := app.FindFirstRecordByFilter("settings", "key='bitrix_webhook'", nil)
	if err == nil && record != nil {
		url = record.GetString("value")
	}
	return &SyncManager{app: app, webhookURL: url}
}

func (s *SyncManager) call(method string, payload map[string]interface{}) ([]byte, error) {
	if s.webhookURL == "" {
		return nil, fmt.Errorf("bitrix webhook URL not configured")
	}

	url := fmt.Sprintf("%s/%s", s.webhookURL, method)
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(b))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("bitrix API status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func (s *SyncManager) SyncAll() error {
	log.Println("[Bitrix] Starting full sync...")
	if err := s.SyncDepartments(); err != nil {
		return err
	}
	if err := s.SyncGroups(); err != nil {
		return err
	}
	if err := s.SyncUsers(); err != nil {
		return err
	}
	if err := s.SyncTasks(); err != nil {
		return err
	}
	log.Println("[Bitrix] Full sync completed.")
	return nil
}

func (s *SyncManager) SyncDepartments() error {
	resp, err := s.call("department.get", nil)
	if err != nil {
		return err
	}

	var data BxResponse[[]BxDepartment]
	json.Unmarshal(resp, &data)

	collection, _ := s.app.FindCollectionByNameOrId("bitrix_departments")
	for _, dept := range data.Result {
		rec, _ := s.app.FindFirstRecordByFilter("bitrix_departments", "bitrix_id={:id}", map[string]interface{}{"id": dept.ID})
		if rec == nil {
			rec = core.NewRecord(collection)
		}
		rec.Set("bitrix_id", dept.ID)
		rec.Set("name", dept.Name)
		rec.Set("parent_bitrix_id", dept.ParentID)
		s.app.Save(rec)
	}
	return nil
}

func (s *SyncManager) SyncGroups() error {
	start := 0
	collection, _ := s.app.FindCollectionByNameOrId("bitrix_groups")
	for {
		resp, err := s.call("sonet_group.get", map[string]interface{}{"start": start})
		if err != nil {
			return err
		}
		var data BxResponse[[]BxGroup]
		json.Unmarshal(resp, &data)
		if len(data.Result) == 0 {
			break
		}

		for _, g := range data.Result {
			rec, _ := s.app.FindFirstRecordByFilter("bitrix_groups", "bitrix_id={:id}", map[string]interface{}{"id": g.ID})
			if rec == nil {
				rec = core.NewRecord(collection)
			}
			rec.Set("bitrix_id", g.ID)
			rec.Set("name", g.Name)
			rec.Set("description", g.Description)
			rec.Set("active", g.Active == "Y")
			s.app.Save(rec)
		}
		if data.Next == 0 {
			break
		}
		start = data.Next
	}
	return nil
}

func (s *SyncManager) SyncUsers() error {
	start := 0
	collection, _ := s.app.FindCollectionByNameOrId("bitrix_users")
	deptColl, _ := s.app.FindCollectionByNameOrId("bitrix_departments")
	for {
		// Use empty filter to get ALL users, including inactive ones
		resp, err := s.call("user.get", map[string]interface{}{
			"start": start,
		})
		if err != nil {
			return err
		}
		var data BxResponse[[]BxUser]
		json.Unmarshal(resp, &data)
		if len(data.Result) == 0 {
			break
		}

		for _, u := range data.Result {
			rec, _ := s.app.FindFirstRecordByFilter("bitrix_users", "bitrix_id={:id}", map[string]interface{}{"id": u.ID})
			if rec == nil {
				rec = core.NewRecord(collection)
			}
			fullName := fmt.Sprintf("%s %s", u.Name, u.LastName)
			rec.Set("bitrix_id", u.ID)
			rec.Set("full_name", fullName)

			// Resolve departments
			var deptIds []string
			for _, dId := range u.Departments {
				dRec, _ := s.app.FindFirstRecordByFilter(deptColl.Id, "bitrix_id={:id}", map[string]interface{}{"id": dId})
				if dRec != nil {
					deptIds = append(deptIds, dRec.Id)
				}
			}
			rec.Set("departments", deptIds)
			if err := s.app.Save(rec); err == nil {
				// Try to auto-link with system user (users collection)
				// Search for a user with the same name
				sysUser, _ := s.app.FindFirstRecordByFilter("users", "name = {:name}", map[string]interface{}{"name": fullName})
				if sysUser != nil {
					// Check if already linked
					if sysUser.Get("bitrix_user") == "" {
						sysUser.Set("bitrix_user", rec.Id)
						if err := s.app.Save(sysUser); err == nil {
							log.Printf("[Bitrix] Auto-linked system user '%s' to bitrix_id %s", fullName, u.ID)
						}
					}
				}
			}
		}
		if data.Next == 0 {
			break
		}
		start = data.Next
	}
	return nil
}

func (s *SyncManager) SyncTasks() error {
	start := 0
	collection, _ := s.app.FindCollectionByNameOrId("bitrix_tasks")
	activeCollection, _ := s.app.FindCollectionByNameOrId("bitrix_tasks_active") // New cache collection

	userMap := make(map[string]string)
	// Fetch ALL users (limit 2000) to ensure map is complete
	users, _ := s.app.FindRecordsByFilter("bitrix_users", "id != ''", "", 2000, 0, nil)
	for _, u := range users {
		// Handle bitrix_id as generic value to support both number and string types in DB
		bxID := u.Get("bitrix_id")
		userMap[fmt.Sprint(bxID)] = u.Id
	}

	groupMap := make(map[string]string)
	// Fetch ALL groups
	groups, _ := s.app.FindRecordsByFilter("bitrix_groups", "id != ''", "", 2000, 0, nil)
	for _, g := range groups {
		bxID := g.Get("bitrix_id")
		groupMap[fmt.Sprint(bxID)] = g.Id
	}

	// 3. Load Cache for speed
	cache := s.LoadTaskCache()

	for {
		        resp, err := s.call("tasks.task.list", map[string]interface{}{
		            "start":  start,
		            "filter": map[string]interface{}{">ID": 0},
		            "order":  map[string]string{"ID": "DESC"}, 
		            "select": []string{"id", "parentId", "title", "description", "status", "responsibleId", "createdBy", "groupId", "deadline", "changedDate", "statusChangedDate", "priority", "createdDate", "commentsCount", "timeEstimate", "timeSpentInLogs", "startDatePlan", "endDatePlan", "closedDate", "accomplices", "auditors", "tags", "ufCrmTask"},
		        		})
		        		if err != nil {
			return err
		}
		var data BxResponse[struct {
			Tasks []BxTask `json:"tasks"`
		}]
		json.Unmarshal(resp, &data)
		if start == 0 {
			log.Printf("[Bitrix] Total tasks reported by API: %d", data.Total)
		}

		if len(data.Result.Tasks) == 0 {
			break
		}

		for _, t := range data.Result.Tasks {
			s.SaveTaskOptimized(t, userMap, groupMap, collection, activeCollection, cache)
		}
		
		processed := start + len(data.Result.Tasks)
		if processed % 1000 == 0 || data.Next == 0 {
			firstID := "unknown"
			lastID := "unknown"
			if len(data.Result.Tasks) > 0 {
				firstID = data.Result.Tasks[0].ID
				lastID = data.Result.Tasks[len(data.Result.Tasks)-1].ID
			}
			log.Printf("[Bitrix] Sync progress: %d / %d tasks (Batch IDs: %s to %s)", processed, data.Total, firstID, lastID)
		}

		if data.Next == 0 {
			break
		}
		start = data.Next
		time.Sleep(100 * time.Millisecond) // Reduced sleep
	}
	return nil
}
