package bitrix

// BxResponse общая структура ответа Bitrix API
type BxResponse[T any] struct {
	Result T   `json:"result"`
	Total  int `json:"total"`
	Next   int `json:"next"`
	Time   struct {
		Start    float64 `json:"start"`
		Finish   float64 `json:"finish"`
		Duration float64 `json:"duration"`
	} `json:"time"`
}

// BxDepartment структура отдела
type BxDepartment struct {
	ID       string `json:"ID"`
	Name     string `json:"NAME"`
	ParentID string `json:"PARENT"`
	HeadID   string `json:"UF_HEAD"`
}

// BxGroup структура проекта/группы
type BxGroup struct {
	ID          string `json:"ID"`
	Name        string `json:"NAME"`
	Description string `json:"DESCRIPTION"`
	Image       string `json:"IMAGE"`
	Active      string `json:"ACTIVE"` // Y/N
	OwnerID     string `json:"OWNER_ID"`
}

// BxUser структура пользователя
type BxUser struct {
	ID            string `json:"ID"`
	Active        bool   `json:"ACTIVE"`
	Email         string `json:"EMAIL"`
	Name          string `json:"NAME"`
	LastName      string `json:"LAST_NAME"`
	SecondName    string `json:"SECOND_NAME"`
	PersonalPhoto string `json:"PERSONAL_PHOTO"`
	WorkPosition  string `json:"WORK_POSITION"`
	Departments   []int  `json:"UF_DEPARTMENT"`
}

// BxTask структура задачи
type BxTask struct {
	ID            string      `json:"id"`
	ParentID      string      `json:"parentId"`
	Title         string      `json:"title"`
	Description   string      `json:"description"`
	Priority      string      `json:"priority"`
	Status        string      `json:"status"`
	StatusChanged string      `json:"statusChangedDate"`
	CreatedDate   string      `json:"createdDate"`
	Deadline      string      `json:"deadline"`
	StartDatePlan string      `json:"startDatePlan"`
	EndDatePlan   string      `json:"endDatePlan"`
	ClosedDate    string      `json:"closedDate"`
	CreatedBy     string      `json:"createdBy"`
	ResponsibleId string      `json:"responsibleId"`
	GroupId       string      `json:"groupId"`
	TimeEstimate  string      `json:"timeEstimate"`
	TimeSpent     string      `json:"timeSpentInLogs"`
	CommentsCount string      `json:"commentsCount"`
	Accomplices   interface{} `json:"accomplices"`
	Auditors      interface{} `json:"auditors"`
	Tags          interface{} `json:"tags"`
	UfCrmTask     interface{} `json:"ufCrmTask"`
}
