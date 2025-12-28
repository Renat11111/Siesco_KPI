package main

import (
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"

	"my_pocketbase_app/internal/app"
	"my_pocketbase_app/internal/bitrix"
	"my_pocketbase_app/internal/config"
	appCore "my_pocketbase_app/internal/core"
	"my_pocketbase_app/internal/handlers"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	pbApp := pocketbase.New()
	appContext := &app.AppContext{
		StatusMap: make(map[string]string),
	}

	// Регистрируем Bitrix (он сам добавит хуки в OnServe)
	if err := bitrix.Register(pbApp); err != nil {
		log.Fatalf("Failed to register Bitrix: %v", err)
	}

	// Основная инициализация в OnServe
	pbApp.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Регистрация хуков через e.App
		appCore.RegisterLeaveRequestHooks(pbApp)
		appCore.RegisterTaskSignaling(pbApp)

		// API Routes
		e.Router.GET("/hello", func(e *core.RequestEvent) error {
			return e.String(200, "Hello world!")
		})

		e.Router.GET("/api/kpi/ranking", func(e *core.RequestEvent) error { return handlers.HandleRanking(pbApp, appContext, e) })
		e.Router.GET("/api/kpi/yearly-ranking", func(e *core.RequestEvent) error { return handlers.HandleYearlyRanking(pbApp, appContext, e) })
		e.Router.GET("/api/kpi/actual-tasks", func(e *core.RequestEvent) error { return handlers.HandleActualTasks(pbApp, appContext, e) })
		e.Router.GET("/api/kpi/completed-tasks-grouped", func(e *core.RequestEvent) error { return handlers.HandleCompletedTasksGrouped(pbApp, appContext, e) })
		e.Router.GET("/api/kpi/returned-tasks", func(e *core.RequestEvent) error { return handlers.HandleReturnedTasks(pbApp, appContext, e) })
		e.Router.POST("/api/kpi/update-task-time", func(e *core.RequestEvent) error { return handlers.HandleUpdateTaskTime(pbApp, appContext, e) })

		// Инициализация структуры
		if err := bootstrapCollections(e.App, appContext); err != nil {
			log.Printf("Bootstrap collections error: %v", err)
		}

		return e.Next()
	})

	if err := pbApp.Start(); err != nil {
		log.Fatal(err)
	}
}

func findConfigFile() (string, error) {
	paths := []string{"config.json", "../config.json", "../../config.json"}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", os.ErrNotExist
}

func bootstrapCollections(pbApp core.App, context *app.AppContext) error {
	log.Println("Initializing collections structure...")

	if err := appCore.EnsureCoreCollections(pbApp); err != nil { return err }
	if err := appCore.EnsureStatusCollection(pbApp); err != nil { return err }
	if err := appCore.EnsureTaskFieldsCollection(pbApp); err != nil { return err }
	if err := appCore.EnsureSettingsCollection(pbApp); err != nil { return err }
	if err := appCore.EnsureViews(pbApp); err != nil { return err }

	configPath, err := findConfigFile()
	if err != nil {
		return nil
	}

	configFile, err := os.Open(configPath)
	if err != nil { return err }
	defer configFile.Close()

	var appConfig config.AppConfig
	bytes, _ := io.ReadAll(configFile)
	if err := json.Unmarshal(bytes, &appConfig); err != nil { return err }

	for _, s := range appConfig.Statuses {
		context.StatusMap[strings.ToLower(strings.TrimSpace(s.Slug))] = s.Type
		context.StatusMap[strings.ToLower(strings.TrimSpace(s.Title))] = s.Type
	}

	statusesCol, _ := pbApp.FindCollectionByNameOrId("statuses")
	if statusesCol != nil {
		existingCount := 0
		pbApp.DB().Select("count(*)").From("statuses").Row(&existingCount)
		if existingCount == 0 {
			log.Println("Populating 'statuses' collection...")
			for _, s := range appConfig.Statuses {
				record := core.NewRecord(statusesCol)
				record.Set("title", s.Title)
				record.Set("slug", s.Slug)
				record.Set("color", s.Color)
				pbApp.Save(record)
			}
		}
	}

	fieldsCol, _ := pbApp.FindCollectionByNameOrId("task_fields")
	if fieldsCol != nil {
		existingCount := 0
		pbApp.DB().Select("count(*)").From("task_fields").Row(&existingCount)
		if existingCount == 0 {
			log.Println("Populating 'task_fields' collection...")
			for i, f := range appConfig.TaskFields {
				record := core.NewRecord(fieldsCol)
				record.Set("key", f.Key)
				record.Set("title", f.Title)
				record.Set("type", f.Type)
				record.Set("required", f.Required)
				record.Set("width", f.Width)
				record.Set("filterable", f.Filterable)
				record.Set("order", i)
				pbApp.Save(record)
			}
		}
	}

	if appConfig.BitrixWebhook != "" {
		settings, _ := pbApp.FindCollectionByNameOrId("settings")
		if settings != nil {
			record, _ := pbApp.FindFirstRecordByFilter("settings", "key='bitrix_webhook'")
			if record == nil {
				record = core.NewRecord(settings)
				record.Set("key", "bitrix_webhook")
			}
			record.Set("value", appConfig.BitrixWebhook)
			pbApp.Save(record)
		}
	}

	return nil
}
