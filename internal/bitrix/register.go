package bitrix

import (
	"log"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Register инициализирует модуль Bitrix: коллекции, роуты, хуки
func Register(app core.App) error {
	// 1. Убеждаемся, что коллекции созданы (внутри хука OnServe, когда БД готова)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		if err := EnsureCollections(app); err != nil {
			log.Printf("[Bitrix] Failed to ensure collections: %v", err)
			return err
		}
		return e.Next()
	})

	// 2. Добавляем API роуты
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.POST("/api/bitrix/sync", func(e *core.RequestEvent) error {
			sync := NewSyncManager(app)
			go sync.SyncAll()
			return e.String(200, "Background sync started")
		})
		return e.Next()
	})

	// 3. Авто-синхронизация при старте (если база пуста)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		go func() {
			time.Sleep(10 * time.Second) // Даем серверу время прогреться
			
			sync := NewSyncManager(app)
			count := 0
			// Используем сырой SQL запрос для скорости проверки наличия записей
			app.DB().Select("count(*)").From("bitrix_tasks").Row(&count)
			
			if count == 0 {
				log.Println("[Bitrix] bitrix_tasks table is empty. Starting initial sync...")
				sync.SyncAll()
			}
		}()
		return e.Next()
	})

	return nil
}