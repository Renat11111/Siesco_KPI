package core

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

func EnsureSettingsCollection(app core.App) error {
	settingsCol, err := app.FindCollectionByNameOrId("settings")
	if err != nil {
		settingsCol = core.NewBaseCollection("settings")
		settingsCol.Fields.Add(&core.TextField{Name: "key", Required: true})
		settingsCol.Fields.Add(&core.TextField{Name: "value", Required: true})
		app.Save(settingsCol)
		settingsCol.AddIndex("idx_settings_key", true, "key", "")
	}
	settingsCol.ListRule = types.Pointer(RuleAuthOnly)
	return app.Save(settingsCol)
}

func EnsureCoreCollections(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil { return err }

	users.ListRule = types.Pointer(RuleAuthOnly)
	users.ViewRule = types.Pointer(RuleAuthOnly)
	if users.Fields.GetByName("superadmin") == nil { users.Fields.Add(&core.BoolField{ Name: "superadmin" }) }
	if users.Fields.GetByName("is_coordinator") == nil { users.Fields.Add(&core.BoolField{ Name: "is_coordinator" }) }
	app.Save(users)

	leaveReqs, err := app.FindCollectionByNameOrId("leave_requests")
	if err != nil {
		leaveReqs = core.NewBaseCollection("leave_requests")
		leaveReqs.Fields.Add(&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true})
		leaveReqs.Fields.Add(&core.DateField{Name: "start_date", Required: true})
		leaveReqs.Fields.Add(&core.DateField{Name: "end_date", Required: true})
		leaveReqs.Fields.Add(&core.TextField{Name: "reason", Required: true})
		leaveReqs.Fields.Add(&core.SelectField{Name: "status", MaxSelect: 1, Values: []string{"pending", "approved", "rejected"}})
		leaveReqs.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		leaveReqs.Fields.Add(&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
		app.Save(leaveReqs)
	}
	leaveReqs.ListRule = types.Pointer(RuleLeaveView)
	leaveReqs.ViewRule = types.Pointer(RuleLeaveView)
	leaveReqs.CreateRule = types.Pointer(RuleAuthOnly)
	leaveReqs.UpdateRule = types.Pointer(RuleAdminOrCoordinatorOnly)
	leaveReqs.DeleteRule = types.Pointer(RuleAdminOrCoordinatorOnly)
	app.Save(leaveReqs)

	tasksCol, err := app.FindCollectionByNameOrId("tasks")
	if err != nil {
		tasksCol = core.NewBaseCollection("tasks")
		tasksCol.Fields.Add(&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true})
		tasksCol.Fields.Add(&core.RelationField{Name: "uploaded_by", CollectionId: users.Id, MaxSelect: 1})
		tasksCol.Fields.Add(&core.JSONField{Name: "data", MaxSize: 2000000})
		tasksCol.Fields.Add(&core.FileField{Name: "excel_file", MaxSelect: 1, MaxSize: 5242880, MimeTypes: []string{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel"}})
		tasksCol.Fields.Add(&core.DateField{Name: "file_date"})
		tasksCol.Fields.Add(&core.TextField{Name: "file_name"})
		app.Save(tasksCol)
	}
	tasksCol.ListRule = types.Pointer(RuleTaskView)
	tasksCol.ViewRule = types.Pointer(RuleTaskView)
	tasksCol.CreateRule = types.Pointer(RuleAuthOnly)
	tasksCol.UpdateRule = types.Pointer(RuleTaskView)
	tasksCol.DeleteRule = types.Pointer(RuleTaskDelete)
	
	idxList := []struct { Name string; Columns string }{
		{"idx_tasks_file_date", "file_date"},
		{"idx_tasks_user", "user"},
		{"idx_tasks_user_file_date", "user,file_date"},
	}
	for _, idx := range idxList {
		found := false
		for _, existing := range tasksCol.Indexes { if strings.Contains(existing, idx.Name) { found = true; break } }
		if !found { tasksCol.AddIndex(idx.Name, false, idx.Columns, "") }
	}
	app.Save(tasksCol)

	for _, name := range []string{"deletion_logs", "upload_logs"} {
		col, _ := app.FindCollectionByNameOrId(name)
		if col == nil {
			col = core.NewBaseCollection(name)
			col.Fields.Add(&core.TextField{Name: "file_name", Required: true})
			if name == "deletion_logs" { 
				col.Fields.Add(&core.TextField{Name: "reason", Required: true})
				col.Fields.Add(&core.RelationField{ Name: "deleted_by", CollectionId: users.Id, MaxSelect: 1 })
				col.Fields.Add(&core.FileField{ Name: "excel_file", MaxSelect: 1, MimeTypes: []string{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel"}})
			} else {
				col.Fields.Add(&core.RelationField{Name: "uploaded_by", CollectionId: users.Id, MaxSelect: 1})
				col.Fields.Add(&core.RelationField{Name: "target_user", CollectionId: users.Id, MaxSelect: 1})
			}
			col.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
			app.Save(col)
		}
		col.ListRule = types.Pointer(RuleAdminOnly)
		col.ViewRule = types.Pointer(RuleAdminOnly)
		col.CreateRule = types.Pointer(RuleAdminOnly) 
		app.Save(col)
	}

	notifsCol, err := app.FindCollectionByNameOrId("notifications")
	if err != nil {
		notifsCol = core.NewBaseCollection("notifications")
		notifsCol.Fields.Add(&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true})
		notifsCol.Fields.Add(&core.TextField{Name: "message", Required: true})
		notifsCol.Fields.Add(&core.BoolField{Name: "is_read"})
		notifsCol.Fields.Add(&core.TextField{Name: "type"})
		app.Save(notifsCol)
	}
	
	// ЖЕСТКИЙ ФИКС ПРАВИЛ (БЕЗ .id)
	notifsCol.ListRule = types.Pointer(RuleNotification)
	notifsCol.ViewRule = types.Pointer(RuleNotification)
	notifsCol.UpdateRule = types.Pointer(RuleNotification)
	notifsCol.DeleteRule = types.Pointer(RuleNotification)
	notifsCol.CreateRule = types.Pointer(RuleAuthOnly)
	app.Save(notifsCol)

	rUpdates, _ := app.FindCollectionByNameOrId("ranking_updates")
	if rUpdates == nil {
		rUpdates = core.NewBaseCollection("ranking_updates")
		app.Save(rUpdates)
	}
	rUpdates.ListRule = types.Pointer(RuleAuthOnly)
	rUpdates.ViewRule = types.Pointer(RuleAuthOnly)
	rUpdates.CreateRule = types.Pointer(RuleAuthOnly)
	app.Save(rUpdates)

	return nil
}

func EnsureStatusCollection(app core.App) error {
	col, err := app.FindCollectionByNameOrId("statuses")
	if err != nil {
		col = core.NewBaseCollection("statuses")
		col.Fields.Add(&core.TextField{Name: "title", Required: true})
		col.Fields.Add(&core.TextField{Name: "slug", Required: true})
		col.Fields.Add(&core.SelectField{Name: "color", Required: true, MaxSelect: 1, Values: []string{"slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "success", "warning", "danger", "info", "primary", "secondary"}})
		col.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		app.Save(col)
	}
	col.ListRule = types.Pointer(RuleAuthOnly)
	return app.Save(col)
}

func EnsureTaskFieldsCollection(app core.App) error {
	col, err := app.FindCollectionByNameOrId("task_fields")
	if err != nil {
		col = core.NewBaseCollection("task_fields")
		col.Fields.Add(&core.TextField{Name: "key", Required: true})
		col.Fields.Add(&core.TextField{Name: "title", Required: true})
		col.Fields.Add(&core.TextField{Name: "type", Required: true})
		col.Fields.Add(&core.TextField{Name: "width"})
		col.Fields.Add(&core.BoolField{Name: "required"})
		col.Fields.Add(&core.BoolField{Name: "filterable"})
		col.Fields.Add(&core.NumberField{Name: "order"})
		app.Save(col)
	}
	col.ListRule = types.Pointer(RuleAuthOnly)
	return app.Save(col)
}

func EnsureViews(app core.App) error {
	users, _ := app.FindCollectionByNameOrId("users")
	monthlyStats, err := app.FindCollectionByNameOrId("monthly_user_stats")
	if err != nil {
		monthlyStats = core.NewBaseCollection("monthly_user_stats")
		monthlyStats.Type = core.CollectionTypeView
		monthlyStats.ViewQuery = `SELECT (t.user || '_' || strftime('%Y-%m', t.file_date)) as id, t.user as user, u.name as user_name, u.email as user_email, strftime('%Y-%m', t.file_date) as month, COALESCE(SUM((SELECT SUM(COALESCE(json_extract(value, '$.time_spent'), 0)) FROM json_each(t.data))), 0) as total_hours FROM tasks t JOIN users u ON u.id = t.user GROUP BY t.user, month`
		monthlyStats.Fields.Add(&core.NumberField{Name: "total_hours"})
		monthlyStats.Fields.Add(&core.TextField{Name: "user_name"})
		monthlyStats.Fields.Add(&core.TextField{Name: "user_email"})
		monthlyStats.Fields.Add(&core.TextField{Name: "month"})
		monthlyStats.Fields.Add(&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1})
		app.Save(monthlyStats)
	}
	monthlyStats.ListRule = types.Pointer(RuleAuthOnly)
	return app.Save(monthlyStats)
}