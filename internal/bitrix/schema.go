package bitrix

import (
	"fmt"
	"log"

	core_rules "my_pocketbase_app/internal/core"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
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
		bxDepts.Fields.Add(&core.TextField{Name: "name", Required: true})
		bxDepts.Fields.Add(&core.NumberField{Name: "parent_bitrix_id"})
		if err := app.Save(bxDepts); err != nil {
			return fmt.Errorf("failed to create bitrix_departments: %w", err)
		}
		bxDepts.AddIndex("idx_bx_dept_id", true, "bitrix_id", "")
		app.Save(bxDepts)
	}

	// 2. Groups
	bxGroups, err := app.FindCollectionByNameOrId("bitrix_groups")
	if err != nil {
		log.Println("Creating 'bitrix_groups' collection...")
		bxGroups = core.NewBaseCollection("bitrix_groups")
		bxGroups.ListRule = types.Pointer(core_rules.RuleAuthOnly)
		bxGroups.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true})
		bxGroups.Fields.Add(&core.TextField{Name: "name", Required: true})
		bxGroups.Fields.Add(&core.TextField{Name: "description", Max: 500000})
		if err := app.Save(bxGroups); err != nil {
			return fmt.Errorf("failed to create bitrix_groups: %w", err)
		}
		bxGroups.AddIndex("idx_bx_group_id", true, "bitrix_id", "")
		app.Save(bxGroups)
	}

	// 3. Users
	bxUsers, err := app.FindCollectionByNameOrId("bitrix_users")
	if err != nil {
		log.Println("Creating 'bitrix_users' collection...")
		bxUsers = core.NewBaseCollection("bitrix_users")
		bxUsers.ListRule = types.Pointer(core_rules.RuleAuthOnly)
		bxUsers.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true})
		bxUsers.Fields.Add(&core.TextField{Name: "full_name"})
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
	}

	// 4. Tasks
	bxTasks, err := app.FindCollectionByNameOrId("bitrix_tasks")
	if err != nil {
		log.Println("Creating 'bitrix_tasks' collection...")
		bxTasks = core.NewBaseCollection("bitrix_tasks")
		bxTasks.ListRule = types.Pointer(core_rules.RuleAuthOnly)
		bxTasks.ViewRule = types.Pointer(core_rules.RuleAuthOnly)

		bxTasks.Fields.Add(&core.NumberField{Name: "bitrix_id", Required: true})
		bxTasks.Fields.Add(&core.TextField{Name: "title", Required: true})
		bxTasks.Fields.Add(&core.TextField{Name: "description", Max: 500000})
		bxTasks.Fields.Add(&core.NumberField{Name: "status"})

		// Relations
		bxTasks.Fields.Add(&core.RelationField{Name: "responsible", CollectionId: bxUsers.Id, MaxSelect: 1})
		bxTasks.Fields.Add(&core.RelationField{Name: "created_by", CollectionId: bxUsers.Id, MaxSelect: 1})
		bxTasks.Fields.Add(&core.RelationField{Name: "group", CollectionId: bxGroups.Id, MaxSelect: 1})

		// Extra Info
		bxTasks.Fields.Add(&core.DateField{Name: "status_changed_date"})
		bxTasks.Fields.Add(&core.DateField{Name: "deadline"})
		bxTasks.Fields.Add(&core.JSONField{Name: "tags"})

		if err := app.Save(bxTasks); err != nil {
			return fmt.Errorf("failed to create bitrix_tasks: %w", err)
		}

		// Self relation
		bxTasks.Fields.Add(&core.RelationField{Name: "parent", CollectionId: bxTasks.Id, MaxSelect: 1})
		if err := app.Save(bxTasks); err != nil {
			return fmt.Errorf("failed to add parent to bitrix_tasks: %w", err)
		}

		bxTasks.AddIndex("idx_bx_task_id", true, "bitrix_id", "")
		app.Save(bxTasks)
	}

	return nil
}