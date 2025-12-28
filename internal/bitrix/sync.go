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
	"github.com/pocketbase/pocketbase/tools/types"
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
	if err := s.SyncDepartments(); err != nil { return err }
	if err := s.SyncGroups(); err != nil { return err }
	if err := s.SyncUsers(); err != nil { return err }
	if err := s.SyncTasks(); err != nil { return err }
	log.Println("[Bitrix] Full sync completed.")
	return nil
}

func (s *SyncManager) SyncDepartments() error {
	resp, err := s.call("department.get", nil)
	if err != nil { return err }

	var data BxResponse[[]BxDepartment]
	json.Unmarshal(resp, &data)

	collection, _ := s.app.FindCollectionByNameOrId("bitrix_departments")
	for _, dept := range data.Result {
		rec, _ := s.app.FindFirstRecordByFilter("bitrix_departments", "bitrix_id={:id}", map[string]interface{}{"id": dept.ID})
		if rec == nil { rec = core.NewRecord(collection) }
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
		if err != nil { return err }
		var data BxResponse[[]BxGroup]
		json.Unmarshal(resp, &data)
		if len(data.Result) == 0 { break }

		for _, g := range data.Result {
			rec, _ := s.app.FindFirstRecordByFilter("bitrix_groups", "bitrix_id={:id}", map[string]interface{}{"id": g.ID})
			if rec == nil { rec = core.NewRecord(collection) }
			rec.Set("bitrix_id", g.ID)
			rec.Set("name", g.Name)
			rec.Set("description", g.Description)
			rec.Set("active", g.Active == "Y")
			s.app.Save(rec)
		}
		if data.Next == 0 { break }
		start = data.Next
	}
	return nil
}

func (s *SyncManager) SyncUsers() error {
	start := 0
	collection, _ := s.app.FindCollectionByNameOrId("bitrix_users")
	deptColl, _ := s.app.FindCollectionByNameOrId("bitrix_departments")
	for {
		resp, err := s.call("user.get", map[string]interface{}{"start": start})
		if err != nil { return err }
		var data BxResponse[[]BxUser]
		json.Unmarshal(resp, &data)
		if len(data.Result) == 0 { break }

		for _, u := range data.Result {
			rec, _ := s.app.FindFirstRecordByFilter("bitrix_users", "bitrix_id={:id}", map[string]interface{}{"id": u.ID})
			if rec == nil { rec = core.NewRecord(collection) }
			rec.Set("bitrix_id", u.ID)
			rec.Set("full_name", fmt.Sprintf("%s %s", u.Name, u.LastName))
			
			// Resolve departments
			var deptIds []string
			for _, dId := range u.Departments {
				dRec, _ := s.app.FindFirstRecordByFilter(deptColl.Id, "bitrix_id={:id}", map[string]interface{}{"id": dId})
				if dRec != nil { deptIds = append(deptIds, dRec.Id) }
			}
			rec.Set("departments", deptIds)
			s.app.Save(rec)
		}
		if data.Next == 0 { break }
		start = data.Next
	}
	return nil
}

func (s *SyncManager) SyncTasks() error {
	start := 0
	collection, _ := s.app.FindCollectionByNameOrId("bitrix_tasks")
	userMap := make(map[string]string)
	users, _ := s.app.FindRecordsByFilter("bitrix_users", "id != ''", "", 0, 0, nil)
	for _, u := range users { userMap[fmt.Sprintf("%d", u.GetInt("bitrix_id"))] = u.Id }

	groupMap := make(map[string]string)
	groups, _ := s.app.FindRecordsByFilter("bitrix_groups", "id != ''", "", 0, 0, nil)
	for _, g := range groups { groupMap[fmt.Sprintf("%d", g.GetInt("bitrix_id"))] = g.Id }

	for {
		resp, err := s.call("tasks.task.list", map[string]interface{}{
			"start": start,
			"select": []string{"ID", "TITLE", "DESCRIPTION", "STATUS", "RESPONSIBLE_ID", "CREATED_BY", "GROUP_ID", "DEADLINE"},
		})
		if err != nil { return err }
		var data BxResponse[struct { Tasks []BxTask `json:"tasks"` }]
		json.Unmarshal(resp, &data)
		if len(data.Result.Tasks) == 0 { break }

		for _, t := range data.Result.Tasks {
			rec, _ := s.app.FindFirstRecordByFilter(collection.Id, "bitrix_id={:id}", map[string]interface{}{"id": t.ID})
			if rec == nil { rec = core.NewRecord(collection) }
			
			rec.Set("bitrix_id", t.ID)
			rec.Set("title", t.Title)
			
			desc := t.Description
			if len(desc) > 5000 { desc = desc[:5000] }
			rec.Set("description", desc)
			rec.Set("status", t.Status)
			
			if pbId, ok := userMap[t.ResponsibleId]; ok { rec.Set("responsible", pbId) }
			if pbId, ok := userMap[t.CreatedBy]; ok { rec.Set("created_by", pbId) }
			if pbId, ok := groupMap[t.GroupId]; ok { rec.Set("group", pbId) }
			
			if t.Deadline != "" {
				if dt, err := types.ParseDateTime(t.Deadline); err == nil {
					rec.Set("deadline", dt)
				}
			}
			s.app.Save(rec)
		}
		if data.Next == 0 { break }
		start = data.Next
		time.Sleep(200 * time.Millisecond)
	}
	return nil
}
