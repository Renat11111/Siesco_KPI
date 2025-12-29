package bitrix

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	core_rules "my_pocketbase_app/internal/core"
)

// EnsureCollections инициализирует все коллекции, относящиеся к Bitrix24
func EnsureCollections(app core.App) error {
	// 1. Departments
	bxDepts, err := app.FindCollectionByNameOrId("bitrix_departments")
	if err != nil {
		log.Println("Creating 'bitrix_departments' collection...")
		bxDepts = core.NewBaseCollection("bitrix_departments")
		bxDepts.ListRule = types.Pointer(core_rules.RuleAuthOnly)
		bxDepts.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true})
		bxDepts.Fields.Add(&core.TextField{Name: "name", Required: true, Presentable: true})
		bxDepts.Fields.Add(&core.NumberField{Name: "parent_bitrix_id"})
		if err := app.Save(bxDepts); err != nil {
			return fmt.Errorf("failed to create bitrix_departments: %w", err)
		}
		bxDepts.AddIndex("idx_bx_dept_id", true, "bitrix_id", "")
		app.Save(bxDepts)
	} else {
		if f := bxDepts.Fields.GetByName("name"); f != nil {
			if tf, ok := f.(*core.TextField); ok {
				log.Println("[Bitrix] Ensuring 'name' is Presentable in 'bitrix_departments'...")
				tf.Presentable = true
				app.Save(bxDepts)
			}
		}
	}

	// 2. Groups
	bxGroups, err := app.FindCollectionByNameOrId("bitrix_groups")
	if err != nil {
		log.Println("Creating 'bitrix_groups' collection...")
		bxGroups = core.NewBaseCollection("bitrix_groups")
		bxGroups.ListRule = types.Pointer(core_rules.RuleAuthOnly)
		bxGroups.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true})
		bxGroups.Fields.Add(&core.TextField{Name: "name", Required: true, Presentable: true})
		bxGroups.Fields.Add(&core.TextField{Name: "description", Max: 500000})
		if err := app.Save(bxGroups); err != nil {
			return fmt.Errorf("failed to create bitrix_groups: %w", err)
		}
		bxGroups.AddIndex("idx_bx_group_id", true, "bitrix_id", "")
		app.Save(bxGroups)
	} else {
		if f := bxGroups.Fields.GetByName("name"); f != nil {
			if tf, ok := f.(*core.TextField); ok {
				log.Println("[Bitrix] Ensuring 'name' is Presentable in 'bitrix_groups'...")
				tf.Presentable = true
				app.Save(bxGroups)
			}
		}
	}

	// 3. Users
	bxUsers, err := app.FindCollectionByNameOrId("bitrix_users")
	if err != nil {
		log.Println("Creating 'bitrix_users' collection...")
		bxUsers = core.NewBaseCollection("bitrix_users")
		bxUsers.ListRule = types.Pointer(core_rules.RuleAuthOnly)
		bxUsers.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true})
		bxUsers.Fields.Add(&core.TextField{Name: "full_name", Presentable: true})
		bxUsers.Fields.Add(&core.RelationField{
			Name:         "departments",
			CollectionId: bxDepts.Id,
			MaxSelect:    99,
		})
		if err := app.Save(bxUsers); err != nil {
			return fmt.Errorf("failed to create bitrix_users: %w", err)
		}
		bxUsers.AddIndex("idx_bx_user_id", true, "bitrix_id", "")
		app.Save(bxUsers)
	} else {
		if f := bxUsers.Fields.GetByName("full_name"); f != nil {
			if tf, ok := f.(*core.TextField); ok {
				log.Println("[Bitrix] Ensuring 'full_name' is Presentable in 'bitrix_users'...")
				tf.Presentable = true
				if err := app.Save(bxUsers); err != nil {
					log.Printf("[Bitrix] Error saving bxUsers schema: %v", err)
				}
			}
		}
	}

	// 4. Tasks (Adding bitrix_id as presentable here too for links)
	bxTasks, err := app.FindCollectionByNameOrId("bitrix_tasks")
	if err != nil {
		log.Println("Creating 'bitrix_tasks' collection...")
		bxTasks = core.NewBaseCollection("bitrix_tasks")
		bxTasks.ListRule = types.Pointer(core_rules.RuleAuthOnly)
		bxTasks.ViewRule = types.Pointer(core_rules.RuleAuthOnly)

		bxTasks.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true, Presentable: true})
		bxTasks.Fields.Add(&core.TextField{Name: "title", Required: true})
		bxTasks.Fields.Add(&core.TextField{Name: "description", Max: 500000})
		bxTasks.Fields.Add(&core.NumberField{Name: "status"})

		// Relations
		bxTasks.Fields.Add(&core.RelationField{Name: "responsible", CollectionId: bxUsers.Id, MaxSelect: 1})
		bxTasks.Fields.Add(&core.RelationField{Name: "created_by", CollectionId: bxUsers.Id, MaxSelect: 1})
		bxTasks.Fields.Add(&core.RelationField{Name: "group", CollectionId: bxGroups.Id, MaxSelect: 1})

		// Extra Info
		bxTasks.Fields.Add(&core.NumberField{Name: "priority"})
		bxTasks.Fields.Add(&core.NumberField{Name: "comments_count"})
		bxTasks.Fields.Add(&core.NumberField{Name: "parent_bitrix_id"})
		bxTasks.Fields.Add(&core.NumberField{Name: "time_estimate"})
		bxTasks.Fields.Add(&core.NumberField{Name: "time_spent"})

		bxTasks.Fields.Add(&core.DateField{Name: "created_date"})
		bxTasks.Fields.Add(&core.DateField{Name: "status_changed_date"})
		bxTasks.Fields.Add(&core.DateField{Name: "bitrix_modified"})
		bxTasks.Fields.Add(&core.DateField{Name: "deadline"})
		bxTasks.Fields.Add(&core.DateField{Name: "start_date_plan"})
		bxTasks.Fields.Add(&core.DateField{Name: "end_date_plan"})
		bxTasks.Fields.Add(&core.DateField{Name: "closed_date"})

		bxTasks.Fields.Add(&core.JSONField{Name: "tags"})
		bxTasks.Fields.Add(&core.JSONField{Name: "accomplices"})
		bxTasks.Fields.Add(&core.JSONField{Name: "auditors"})
		bxTasks.Fields.Add(&core.JSONField{Name: "uf_crm_task"})

		if err := app.Save(bxTasks); err != nil {
			return fmt.Errorf("failed to create bitrix_tasks: %w", err)
		}

		// Self relation
		bxTasks.Fields.Add(&core.RelationField{Name: "parent", CollectionId: bxTasks.Id, MaxSelect: 1})
		if err := app.Save(bxTasks); err != nil {
			return fmt.Errorf("failed to add parent to bitrix_tasks: %w", err)
		}

		bxTasks.AddIndex("idx_bx_task_id", true, "bitrix_id", "")
		bxTasks.AddIndex("idx_bx_task_modified", false, "bitrix_modified", "")
		app.Save(bxTasks)
	}

	// 5. Active Tasks (Cache for UI)
	bxActiveTasks, err := app.FindCollectionByNameOrId("bitrix_tasks_active")
	if err != nil {
		log.Println("Creating 'bitrix_tasks_active' collection...")
		bxActiveTasks = core.NewBaseCollection("bitrix_tasks_active")
		
		// API Rules for visibility
		rule := "@request.auth.superadmin = true || @request.auth.is_coordinator = true || responsible = @request.auth.bitrix_user"
		bxActiveTasks.ListRule = types.Pointer(rule)
		bxActiveTasks.ViewRule = types.Pointer(rule)

		// Copy fields from bxTasks definition
		bxActiveTasks.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true, Presentable: true})
		bxActiveTasks.Fields.Add(&core.TextField{Name: "title", Required: true})
		bxActiveTasks.Fields.Add(&core.TextField{Name: "description", Max: 500000})
		bxActiveTasks.Fields.Add(&core.NumberField{Name: "status"})

		// Relations
		bxActiveTasks.Fields.Add(&core.RelationField{Name: "responsible", CollectionId: bxUsers.Id, MaxSelect: 1})
		bxActiveTasks.Fields.Add(&core.RelationField{Name: "created_by", CollectionId: bxUsers.Id, MaxSelect: 1})
		bxActiveTasks.Fields.Add(&core.RelationField{Name: "group", CollectionId: bxGroups.Id, MaxSelect: 1})

		// Extra Info
		bxActiveTasks.Fields.Add(&core.NumberField{Name: "priority"})
		bxActiveTasks.Fields.Add(&core.NumberField{Name: "comments_count"})
		bxActiveTasks.Fields.Add(&core.NumberField{Name: "parent_bitrix_id"})
		bxActiveTasks.Fields.Add(&core.NumberField{Name: "time_estimate"})
		bxActiveTasks.Fields.Add(&core.NumberField{Name: "time_spent"})

		bxActiveTasks.Fields.Add(&core.DateField{Name: "created_date"})
		bxActiveTasks.Fields.Add(&core.DateField{Name: "status_changed_date"})
		bxActiveTasks.Fields.Add(&core.DateField{Name: "bitrix_modified"})
		bxActiveTasks.Fields.Add(&core.DateField{Name: "deadline"})
		bxActiveTasks.Fields.Add(&core.DateField{Name: "start_date_plan"})
		bxActiveTasks.Fields.Add(&core.DateField{Name: "end_date_plan"})
		bxActiveTasks.Fields.Add(&core.DateField{Name: "closed_date"})

		bxActiveTasks.Fields.Add(&core.JSONField{Name: "tags"})
		bxActiveTasks.Fields.Add(&core.JSONField{Name: "accomplices"})
		bxActiveTasks.Fields.Add(&core.JSONField{Name: "auditors"})
		bxActiveTasks.Fields.Add(&core.JSONField{Name: "uf_crm_task"})

		if err := app.Save(bxActiveTasks); err != nil {
			return fmt.Errorf("failed to create bitrix_tasks_active: %w", err)
		}
		
		// Self relation (to active tasks collection)
		bxActiveTasks.Fields.Add(&core.RelationField{Name: "parent", CollectionId: bxActiveTasks.Id, MaxSelect: 1})
		if err := app.Save(bxActiveTasks); err != nil {
			return fmt.Errorf("failed to add parent to bitrix_tasks_active: %w", err)
		}

		bxActiveTasks.AddIndex("idx_bx_active_task_id", true, "bitrix_id", "")
		app.Save(bxActiveTasks)
	}

	return nil
}
