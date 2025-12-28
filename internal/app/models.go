package app

// TaskEntry — это динамическая карта, которая позволяет хранить ЛЮБЫЕ поля из Excel (настраиваются в task_fields).
// Мы используем map[string]interface{}, чтобы поддерживать неограниченное количество динамических колонок.
type TaskEntry map[string]interface{}
