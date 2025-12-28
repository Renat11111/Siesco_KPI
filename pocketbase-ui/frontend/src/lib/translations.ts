export type Language = 'ru' | 'az' | 'en';

export interface TranslationKeys {
    login: string;
    register: string;
    createAccount: string;
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    processing: string;
    welcome: string;
    welcomeMessage: string;
    logout: string;
    dontHaveAccount: string;
    alreadyHaveAccount: string;
    passwordsDoNotMatch: string;
    changePassword: string;
    oldPassword: string;
    newPassword: string;
    newPasswordConfirm: string;
    passwordChangedSuccess: string;
    cancel: string;
    save: string;

    // Tabs
    tabUpload: string;
    tabBitrix: string;
    tabAnalytics: string;
    tabView: string;
    tabTimeOff: string;
    uploadTitle: string;
    reportDate: string;
    superadminMode: string;
    lockedDate: string;
    dragDrop: string;
    orBrowse: string;
    selectFile: string;
    validating: string;
    reading: string;
    errorPrefix: string;
    mustLogin: string;
    noValidTasks: string;
    uploadingMsg: string;
    successMsg: string;
    tasksCount: string;
    validationFailed: string;
    fieldIsEmpty: string;
    invalidValue: string;
    mustBeNumber: string;
    row: string;
    fileAlreadyExists: string;
    limitReached: string;
    allowedValues: string;
    infoTitle: string;
    ruleName: string;
    ruleLimit: string;
    ruleUnique: string;
    infoColsTitle: string;
    modeUpload: string;
    modeDelete: string;
    confirmDelete: string;
    searchingDeleting: string;
    fileNotFound: string;
    fileDeleted: string;
    enterReason: string;
    myTasks: string;
    showUnfinished: string;
    showGroupedCompleted: string;
    from: string;
    to: string;
    taskNumber: string;
    showTasks: string;
    loading: string;
    noTasks: string;
    foundTasks: string;
    colDate: string;
    colTaskNum: string;
    colProject: string;
    colStatus: string;
    colEst: string;
    colSpent: string;
    colDesc: string;
    total: string;
    all: string;
    statsTitle: string;
    statsStatus: string;
    statsCount: string;
    statsTotal: string;
    statsTotalHours: string;
    statsLoading: string;
    statsMonthTitle: string;
    statsComparisonTitle: string;
    statsChartTitle: string;
    statsRankingTitle: string;
    statsYearlyRankingTitle: string;
    statsYourRank: string;
    statsHoursUnit: string;
    returnedTasksTitle: string;
    legendCurrent: string;
    legendPrev: string;
    genericError: string;
    confirmUploadForOther: string;
    onlySuperusers: string;

    // Time Off
    timeOffTitle: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    submitRequest: string;
    requestHistory: string;
    statusPending: string;
    statusApproved: string;
    statusRejected: string;
    requestSubmitted: string;
    deleteRequest: string;
    confirmDeleteRequest: string;
    requestDeleted: string;
    errorPastDate: string;
    errorEndDate: string;
    errorOverlap: string;
    filterPeriod: string;
}

export const translations: Record<Language, TranslationKeys> = {
    ru: {
        // Auth
        login: "Вход",
        register: "Регистрация",
        createAccount: "Создать аккаунт",
        name: "Имя",
        email: "Email",
        password: "Пароль",
        confirmPassword: "Подтвердите пароль",
        processing: "Обработка...",
        welcome: "Добро пожаловать",
        welcomeMessage: "Добро пожаловать в Siesco KPI",
        logout: "Выйти",
        dontHaveAccount: "Нет аккаунта? Зарегистрироваться",
        alreadyHaveAccount: "Уже есть аккаунт? Войти",
        passwordsDoNotMatch: "Пароли не совпадают",
        changePassword: "Сменить пароль",
        oldPassword: "Старый пароль",
        newPassword: "Новый пароль",
        newPasswordConfirm: "Подтвердите новый пароль",
        passwordChangedSuccess: "Пароль успешно изменен",
        cancel: "Отмена",
        save: "Сохранить",
        
        // Tabs
        tabUpload: "Загрузить отчет",
        tabBitrix: "Задачи Bitrix",
        tabAnalytics: "Детальная аналитика",
        tabView: "Просмотреть задачи",
        tabTimeOff: "Отгулы",

        // Upload
        uploadTitle: "Загрузка отчета о задачах",
        reportDate: "Дата отчета",
        superadminMode: "Режим Супер-админа",
        lockedDate: "Дата зафиксирована на сегодня. Имя файла должно начинаться с",
        dragDrop: "Перетащите Excel файл сюда",
        orBrowse: "или нажмите для выбора",
        selectFile: "Выбрать файл",
        validating: "Проверка файла...",
        reading: "Чтение файла...",
        errorPrefix: "Ошибка файла должен начинаться с",
        mustLogin: "Вы должны войти в систему",
        noValidTasks: "В файле не найдено валидных задач",
        uploadingMsg: "Загрузка данных...",
        successMsg: "Успешно! Загружен файл с",
        tasksCount: "задачами",
        validationFailed: "Ошибка валидации. Данные не загружены.", 
        fieldIsEmpty: "поле не может быть пустым.", 
        invalidValue: "Неверное значение", 
        mustBeNumber: "Должно быть числом", 
        row: "Строка", 
        fileAlreadyExists: "Файл с таким именем уже загружен", 
        limitReached: "Лимит загрузок на эту дату исчерпан (макс. 2 файла)",
        allowedValues: "Допустимые значения",
        infoTitle: "Правила загрузки",
        ruleName: "Имя файла: ДД.ММ.ГГГГ_...",
        ruleLimit: "Лимит: 2 файла в день",
        ruleUnique: "Без дубликатов имен",
        infoColsTitle: "Колонки: ",
        
        modeUpload: "Загрузка",
        modeDelete: "Удаление",
        confirmDelete: "Вы уверены, что хотите удалить отчет из базы данных? Имя файла:",
        searchingDeleting: "Поиск и удаление...",
        fileNotFound: "Файл с таким именем не найден в базе данных.",
        fileDeleted: "Файл успешно удален:",
        enterReason: "Причина удаления",
        
        // List
        myTasks: "Мои задачи",
        showUnfinished: "Показать невыполненные",
        showGroupedCompleted: "Сгруппировать завершенные",
        from: "С",
        to: "По",
        taskNumber: "№ Задачи", 
        showTasks: "Показать задачи",
        loading: "Загрузка...",
        noTasks: "Задач за этот период не найдено.",
        foundTasks: "Найдено задач:",
        colDate: "Дата",
        colTaskNum: "№ Задачи",
        colProject: "Проект",
        colStatus: "Статус",
        colEst: "Оценка",
        colSpent: "Затрачено",
        colDesc: "Описание",
        total: "Итого:",
        all: "Все",
        
        // Daily Stats
        statsTitle: "Статистика за сегодня",
        statsStatus: "Статус",
        statsCount: "Кол-во",
        statsTotal: "Всего задач",
        statsTotalHours: "Всего часов",
        statsLoading: "Загрузка статистики...",
        statsMonthTitle: "Часы за текущий месяц",
        statsComparisonTitle: "Сравнение результатов прошлого периода",
        statsChartTitle: "Динамика выполнения задач (по дням)",
        statsRankingTitle: "Рейтинг среди коллег (часы за месяц)",
        statsYearlyRankingTitle: "Рейтинг среди коллег (часы за год)",
        statsYourRank: "Вы",
        statsHoursUnit: "ч",
        returnedTasksTitle: "Возвращенные задачи",
        legendCurrent: "Текущий месяц",
        legendPrev: "Прошлый месяц",

        // Errors
        genericError: "Произошла ошибка",
        confirmUploadForOther: "Вы уверены, что хотите загрузить файл от имени {name}?",
        onlySuperusers: "Только суперпользователи могут менять статус супер-админа",

        // Time Off
        timeOffTitle: "Запрос на отгул",
        startDate: "Дата начала",
        endDate: "Дата окончания",
        reason: "Причина",
        status: "Статус",
        submitRequest: "Отправить запрос",
        requestHistory: "История запросов",
        statusPending: "Ожидает",
        statusApproved: "Одобрено",
        statusRejected: "Отклонено",
        requestSubmitted: "Запрос успешно отправлен",
        deleteRequest: "Удалить",
        confirmDeleteRequest: "Вы уверены, что хотите удалить этот запрос?",
        requestDeleted: "Запрос удален",
        errorPastDate: "Дата начала не может быть в прошлом",
        errorEndDate: "Дата окончания не может быть раньше даты начала",
        errorOverlap: "У вас уже есть активная заявка на этот период (даты пересекаются)",
        filterPeriod: "Период",
    },
    az: {
        // Auth
        login: "Giriş",
        register: "Qeydiyyat",
        createAccount: "Hesab yaratmaq",
        name: "Ad",
        email: "E-poçt",
        password: "Şifrə",
        confirmPassword: "Şifrəni təsdiqləyin",
        processing: "Emal edilir...",
        welcome: "Xoş gəlmisiniz",
        welcomeMessage: "Siesco KPI-a xoş gəlmisiniz",
        logout: "Çıxış",
        dontHaveAccount: "Hesabınız yoxdur? Qeydiyyatdan keçin",
        alreadyHaveAccount: "Artıq hesabınız var? Giriş",
        passwordsDoNotMatch: "Şifrələr uyğun gəlmir",
        changePassword: "Şifrəni dəyiş",
        oldPassword: "Köhnə şifrə",
        newPassword: "Yeni şifrə",
        newPasswordConfirm: "Yeni şifrəni təsdiqləyin",
        passwordChangedSuccess: "Şifrə uğurla dəyişdirildi",
        cancel: "Ləğv et",
        save: "Yadda saxla",

        // Tabs
        tabUpload: "Hesabat yüklə",
        tabBitrix: "Bitrix Tapşırıqları",
        tabAnalytics: "Ətraflı analitika",
        tabView: "Tapşırıqlara bax",
        tabTimeOff: "İcazə",

        // Upload
        uploadTitle: "Tapşırıq hesabatının yüklənməsi",
        reportDate: "Hesabat tarixi",
        superadminMode: "Super-admin rejimi",
        lockedDate: "Tarix bu günə təyin edilib. Fayl adı bununla başlamalıdır:",
        dragDrop: "Excel faylını bura atın",
        orBrowse: "və ya seçmək üçün klikləyin",
        selectFile: "Fayl seçin",
        validating: "Fayl yoxlanılır...",
        reading: "Fayl oxunur...",
        errorPrefix: "Xəta: Fayl adı bununla başlamalıdır",
        mustLogin: "Sistemə daxil olmalısınız",
        noValidTasks: "Faylda düzgün tapşırıq tapılmadı",
        uploadingMsg: "Məlumat yüklənir...",
        successMsg: "Uğurlu! Fayl yükləndi",
        tasksCount: "tapşırıqla",
        validationFailed: "Validasiya xətası. Məlumat yüklənmədi.", 
        fieldIsEmpty: "sahəsi boş ola bilməz.",
        invalidValue: "Yanlış dəyər",
        mustBeNumber: "Rəqəm olmalıdır",
        row: "Sətir", 
        fileAlreadyExists: "Bu adda fayl artıq yüklənib", 
        limitReached: "Bu tarix üçün yükləmə limiti dolub (maks. 2 fayl)",
        allowedValues: "İcazə verilən dəyərlər",
        infoTitle: "Yükləmə qaydaları",
        ruleName: "Fayl adı: GG.AA.İİİİ_...",
        ruleLimit: "Limit: gündə 2 fayl",
        ruleUnique: "Təkrar adlar qadağandır",
        infoColsTitle: "Sütunlar: ",

        modeUpload: "Yükləmə",
        modeDelete: "Silinmə",
        confirmDelete: "Hesabatı verilənlər bazasından silmək istədiyinizə əminsiniz? Fayl adı:",
        searchingDeleting: "Axtarış və silinmə...",
        fileNotFound: "Verilənlər bazasında bu adda fayl tapılmadı.",
        fileDeleted: "Fayl uğurla silindi:",
        enterReason: "Silinmə səbəbi",

        // List
        myTasks: "Tapşırıqlarım",
        showUnfinished: "Bitməmiş tapşırıqları göstər",
        showGroupedCompleted: "Tamamlananları qruplaşdırın",
        from: "Başlanğıc",
        to: "Son",
        taskNumber: "Tapşırıq №", 
        showTasks: "Göstər",
        loading: "Yüklənir...",
        noTasks: "Bu dövr üçün tapşırıq tapılmadı.",
        foundTasks: "Tapıldı:",
        colDate: "Tarix",
        colTaskNum: "Tapşırıq №",
        colProject: "Layihə",
        colStatus: "Status",
        colEst: "Qiymət",
        colSpent: "Xərclənən",
        colDesc: "Təsvir",
        total: "Cəmi:",
        all: "Hamısı",

        // Daily Stats
        statsTitle: "Bugünkü statistika",
        statsStatus: "Status",
        statsCount: "Say",
        statsTotal: "Cəmi tapşırıqlar",
        statsTotalHours: "Cəmi saat",
        statsLoading: "Statistika yüklənir...",
        statsMonthTitle: "Cari ayın saatları",
        statsComparisonTitle: "Keçmiş dövrün nəticələrinin müqayisəsi",
        statsChartTitle: "Tapşırıqların icra dinamikası (günlər üzrə)",
        statsRankingTitle: "Həmkarlar arasında reytinq (aylıq saatlar)",
        statsYearlyRankingTitle: "Həmkarlar arasında reytinq (illik saatlar)",
        statsYourRank: "Siz",
        statsHoursUnit: "s",
        returnedTasksTitle: "Qaytarılmış tapşırıqlar",
        legendCurrent: "Cari ay",
        legendPrev: "Keçmiş ay",

        // Errors
        genericError: "Xəta baş verdi",
        confirmUploadForOther: "{name} adına fayl yükləmək istədiyinizə əminsiniz?",
        onlySuperusers: "Yalnız super istifadəçilər statusu dəyişə bilər",

        // Time Off
        timeOffTitle: "İcazə sorğusu",
        startDate: "Başlanğıc tarixi",
        endDate: "Son tarixi",
        reason: "Səbəb",
        status: "Status",
        submitRequest: "Sorğu göndər",
        requestHistory: "Sorğu tarixçəsi",
        statusPending: "Gözlənilir",
        statusApproved: "Təsdiqləndi",
        statusRejected: "Rədd edildi",
        requestSubmitted: "Sorğu uğurla göndərildi",
        deleteRequest: "Sil",
        confirmDeleteRequest: "Bu sorğunu silmək istədiyinizə əminsiniz?",
        requestDeleted: "Sorğu silindi",
        errorPastDate: "Başlanğıc tarixi keçmişdə ola bilməz",
        errorEndDate: "Bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz",
        errorOverlap: "Bu dövr üçün artıq aktiv icazə sorğunuz var (tarixlər üst-üstə düşür)",
        filterPeriod: "Dövr",
    },
    en: {
        // Auth
        login: "Login",
        register: "Register",
        createAccount: "Create Account",
        name: "Name",
        email: "Email",
        password: "Password",
        confirmPassword: "Confirm Password",
        processing: "Processing...",
        welcome: "Welcome",
        welcomeMessage: "Welcome to Siesco KPI",
        logout: "Logout",
        dontHaveAccount: "Don't have an account? Register",
        alreadyHaveAccount: "Already have an account? Login",
        passwordsDoNotMatch: "Passwords do not match",
        changePassword: "Change Password",
        oldPassword: "Old Password",
        newPassword: "New Password",
        newPasswordConfirm: "Confirm New Password",
        passwordChangedSuccess: "Password changed successfully",
        cancel: "Cancel",
        save: "Save",

        // Tabs
        tabUpload: "Upload Report",
        tabBitrix: "Bitrix Tasks",
        tabAnalytics: "Detailed Analytics",
        tabView: "View Tasks",
        tabTimeOff: "Time Off",

        // Upload
        uploadTitle: "Upload Task Report",
        reportDate: "Report Date",
        superadminMode: "Superadmin Mode",
        lockedDate: "Date is locked to Today. File name must start with",
        dragDrop: "Drag & Drop Excel file here",
        orBrowse: "or click to browse",
        selectFile: "Select File",
        validating: "Validating file...",
        reading: "Reading file...",
        errorPrefix: "Error: File name must start with",
        mustLogin: "You must be logged in",
        noValidTasks: "No valid tasks found in the file",
        uploadingMsg: "Uploading data...",
        successMsg: "Success! Uploaded file with",
        tasksCount: "tasks",
        validationFailed: "Validation failed. No data was uploaded.",
        fieldIsEmpty: "field cannot be empty.",
        invalidValue: "Invalid value",
        mustBeNumber: "Must be a number",
        row: "Row", 
        fileAlreadyExists: "File with this name already uploaded", 
        limitReached: "Upload limit reached for this date (max 2 files)",
        allowedValues: "Allowed values",
        infoTitle: "Upload Rules",
        ruleName: "Filename: DD.MM.YYYY_...",
        ruleLimit: "Limit: 2 files per day",
        ruleUnique: "No duplicate filenames",
        infoColsTitle: "Columns: ",

        modeUpload: "Upload",
        modeDelete: "Delete",
        confirmDelete: "Are you sure you want to delete report from the database? Filename:",
        searchingDeleting: "Searching and deleting...",
        fileNotFound: "File not found in database.",
        fileDeleted: "File deleted successfully:",
        enterReason: "Reason",

        // List
        myTasks: "My Tasks",
        showUnfinished: "Show Unfinished",
        showGroupedCompleted: "Group Completed",
        from: "From",
        to: "To",
        taskNumber: "Task #", 
        showTasks: "Show Tasks",
        loading: "Loading...",
        noTasks: "No tasks found for this period.",
        foundTasks: "Found tasks:",
        colDate: "Date",
        colTaskNum: "Task #",
        colProject: "Project",
        colStatus: "Status",
        colEst: "Est.",
        colSpent: "Spent",
        colDesc: "Description",
        total: "Total:",
        all: "All",

        // Daily Stats
        statsTitle: "Today's Statistics",
        statsStatus: "Status",
        statsCount: "Count",
        statsTotal: "Total Tasks",
        statsTotalHours: "Total Hours",
        statsLoading: "Loading stats...",
        statsMonthTitle: "Current Month Hours",
        statsComparisonTitle: "Comparison of previous period results",
        statsChartTitle: "Task Performance Dynamics (Daily)",
        statsRankingTitle: "Colleague Ranking (Monthly Hours)",
        statsYearlyRankingTitle: "Colleague Ranking (Yearly Hours)",
        statsYourRank: "You",
        statsHoursUnit: "h",
        returnedTasksTitle: "Returned Tasks",
        legendCurrent: "Current Month",
        legendPrev: "Previous Month",

        // Errors
        genericError: "An error occurred",
        confirmUploadForOther: "Are you sure you want to upload this file on behalf of {name}?",
        onlySuperusers: "Only superusers can change the superadmin status",

        // Time Off
        timeOffTitle: "Leave Request",
        startDate: "Start Date",
        endDate: "End Date",
        reason: "Reason",
        status: "Status",
        submitRequest: "Submit Request",
        requestHistory: "Request History",
        statusPending: "Pending",
        statusApproved: "Approved",
        statusRejected: "Rejected",
        requestSubmitted: "Request submitted successfully",
        deleteRequest: "Delete",
        confirmDeleteRequest: "Are you sure you want to delete this request?",
        requestDeleted: "Request deleted",
        errorPastDate: "Start date cannot be in the past",
        errorEndDate: "End date cannot be before start date",
        errorOverlap: "You already have an active leave request for this period (overlapping dates)",
        filterPeriod: "Period",
    }
};