package core

// PocketBase API Rules (Constants)
const (
	RuleAuthOnly                  = "@request.auth.id != ''"
	RuleAdminOnly                 = "@request.auth.id != '' && @request.auth.superadmin = true"
	RuleAdminOrCoordinatorOnly    = "@request.auth.id != '' && (@request.auth.superadmin = true || @request.auth.is_coordinator = true)"
	
	// Правила для ЗАДАЧ
	RuleTaskView   = "@request.auth.id != '' && (@request.auth.id = user || @request.auth.id = uploaded_by || @request.auth.superadmin = true || @request.auth.is_coordinator = true)"
	RuleTaskDelete = "@request.auth.id != '' && (@request.auth.id = user || @request.auth.id = uploaded_by || @request.auth.superadmin = true)"
	
	// Правила для ОТГУЛОВ
	RuleLeaveView   = "@request.auth.id != '' && (@request.auth.id = user || @request.auth.superadmin = true || @request.auth.is_coordinator = true)"
	RuleLeaveDelete = "@request.auth.id != '' && (@request.auth.id = user || @request.auth.superadmin = true || @request.auth.is_coordinator = true)"
	
	// Правило для КОЛОКОЛЬЧИКА (ФИКС: правильный синтаксис как в бэкапе)
	RuleNotification = "@request.auth.id = user"
)