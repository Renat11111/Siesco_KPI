package main

// Структуры конфигурации
type StatusConfig struct {
	Title string `json:"title"`
	Slug  string `json:"slug"`
	Color string `json:"color"`
	Type  string `json:"type"` // "final", "in_progress", "return"
}

type TaskFieldConfig struct {
	Key        string `json:"key"`
	Title      string `json:"title"`
	Type       string `json:"type"`
	Required   bool   `json:"required"`
	Width      string `json:"width"`
	Filterable bool   `json:"filterable"`
}

type AppConfig struct {
	Statuses   []StatusConfig    `json:"statuses"`
	TaskFields []TaskFieldConfig `json:"task_fields"`
}

// AppContext содержит зависимости приложения
type AppContext struct {
	StatusMap map[string]string
}

// Константы для исключения магических строк
const (
	CollectionTasks = "tasks"
	FieldData       = "data"
	FieldUser       = "user"
	FieldFileDate   = "file_date"
	FieldFileName   = "file_name"
	StatusFinal     = "final"
	StatusReturn    = "return"
)
