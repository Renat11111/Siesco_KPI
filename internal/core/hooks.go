package core

import (
	"fmt"
	"net/mail"
	"time"

	"github.com/pocketbase/pocketbase"
	pbCore "github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

// triggerSignal отправляет глобальный сигнал обновления
func triggerSignal(app *pocketbase.PocketBase) {
	col, _ := app.FindCollectionByNameOrId("ranking_updates")
	if col == nil {
		return
	}
	rec, _ := app.FindFirstRecordByFilter("ranking_updates", "id != ''", nil)
	if rec == nil {
		rec = pbCore.NewRecord(col)
	}
	rec.Set("updated", time.Now().UTC())
	app.Save(rec)
}

// RegisterLeaveRequestHooks настраивает логику для заявок на отгул
func RegisterLeaveRequestHooks(app *pocketbase.PocketBase) {

	// 1. UPDATE Hook
	app.OnRecordAfterUpdateSuccess("leave_requests").BindFunc(func(e *pbCore.RecordEvent) error {
		oldStatus := e.Record.Original().GetString("status")
		newStatus := e.Record.GetString("status")
		userId := e.Record.GetString("user")

		if oldStatus != newStatus && (newStatus == "approved" || newStatus == "rejected") {
			notifs, _ := e.App.FindCollectionByNameOrId("notifications")
			if notifs != nil {
				rec := pbCore.NewRecord(notifs)
				rec.Set("user", userId)
				msg := "Ваш запрос на отгул обновлен"
				if newStatus == "approved" {
					msg = "Ваш запрос на отгул ОДОБРЕН ✅"
				}
				if newStatus == "rejected" {
					msg = "Ваш запрос на отгул ОТКЛОНЕН ❌"
				}
				rec.Set("message", msg)
				rec.Set("type", "info")
				if newStatus == "approved" {
					rec.Set("type", "success")
				}
				if newStatus == "rejected" {
					rec.Set("type", "error")
				}
				rec.Set("is_read", false)
				e.App.Save(rec) // СИНХРОННО
				triggerSignal(app)
			}
		}
		return e.Next()
	})

	// 2. CREATE Hook
	app.OnRecordCreateRequest("leave_requests").BindFunc(func(e *pbCore.RecordRequestEvent) error {
		if e.Auth != nil {
			e.Record.Set("user", e.Auth.Id)
		}

		newStart := e.Record.GetString("start_date")
		newEnd := e.Record.GetString("end_date")
		userId := e.Record.GetString("user")
		existing, _ := e.App.FindRecordsByFilter("leave_requests", "user = {:user} && status != 'rejected' && start_date <= {:newEnd} && end_date >= {:newStart}", "", 1, 0, map[string]interface{}{"user": userId, "newStart": newStart, "newEnd": newEnd})
		if len(existing) > 0 {
			return e.BadRequestError("You already have an active leave request for this period", nil)
		}

		if err := e.Next(); err != nil {
			return err
		}

		// ЛОГИКА УВЕДОМЛЕНИЙ (СИНХРОННО как в твоем анализе)
		userRec, _ := app.FindRecordById("users", userId)
		userName := "Unknown"
		if userRec != nil {
			userName = userRec.GetString("name")
		}

		admins, err := app.FindRecordsByFilter("users", "superadmin=true || is_coordinator=true", "", 100, 0, nil)
		if err != nil || len(admins) == 0 {
			return nil
		}

		notifsCol, _ := app.FindCollectionByNameOrId("notifications")
		senderAddress := app.Settings().Meta.SenderAddress
		senderName := app.Settings().Meta.SenderName

		for _, admin := range admins {
			// А. Внутреннее уведомление (СИНХРОННО для надежности)
			if notifsCol != nil {
				rec := pbCore.NewRecord(notifsCol)
				rec.Set("user", admin.Id)
				rec.Set("message", "📅 Новый запрос на отгул: "+userName)
				rec.Set("type", "warning")
				rec.Set("is_read", false)
				e.App.Save(rec)
			}

			// Б. Email (в фоне)
			email := admin.GetString("email")
			if email != "" {
				go func(to, name, reason string) {
					subj := "New Leave Request from " + name
					body := fmt.Sprintf(`<h3>New Leave Request</h3><p><strong>User:</strong> %s</p><p><strong>Reason:</strong> %s</p>`, name, reason)
					app.NewMailClient().Send(&mailer.Message{
						From:    mail.Address{Address: senderAddress, Name: senderName},
						To:      []mail.Address{{Address: to}},
						Subject: subj,
						HTML:    body,
					})
				}(email, userName, e.Record.GetString("reason"))
			}
		}
		triggerSignal(app)
		return nil
	})
}

// RegisterTaskSignaling хуки для Realtime KPI
func RegisterTaskSignaling(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess("tasks").BindFunc(func(e *pbCore.RecordEvent) error { triggerSignal(app); return e.Next() })
	app.OnRecordAfterUpdateSuccess("tasks").BindFunc(func(e *pbCore.RecordEvent) error { triggerSignal(app); return e.Next() })
	app.OnRecordAfterDeleteSuccess("tasks").BindFunc(func(e *pbCore.RecordEvent) error { triggerSignal(app); return e.Next() })
}
