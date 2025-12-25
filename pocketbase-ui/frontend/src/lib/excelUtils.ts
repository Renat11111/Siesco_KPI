import * as XLSX from 'xlsx';
import { TaskField, Status } from './SettingsContext';

/**
 * Превращает ISO дату (YYYY-MM-DD) в формат DD.MM.YYYY для проверки имени файла
 */
export const getFormattedDateForCheck = (isoDateString: string) => {
    if (!isoDateString) return "";
    const parts = isoDateString.split('-');
    if (parts.length !== 3) return "";
    const [year, month, day] = parts;
    return `${day}.${month}.${year}`;
};

/**
 * Строгий парсинг даты из ячейки Excel (поддерживает числовой формат Excel и строки)
 */
export const parseDateStrict = (excelDate: any): string | null => {
    if (!excelDate) return null;
    
    try {
        if (typeof excelDate === 'number') {
             const date = new Date(Math.round((excelDate - 25569)*86400*1000));
             if (isNaN(date.getTime())) return null;
             return date.toISOString();
        }
        if (typeof excelDate === 'string') {
            const trimmed = excelDate.trim();
            const parts = trimmed.split('.');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                
                const d = new Date(year, month, day);
                if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
                    d.setHours(12); 
                    return d.toISOString();
                }
            }
            
            const d = new Date(excelDate);
            if (!isNaN(d.getTime())) return d.toISOString();
        }
    } catch (e) {
        return null;
    }
    return null;
};

/**
 * Валидация и парсинг строк Excel на основе динамических полей
 */
export const validateAndParseExcelRows = (
    data: any[][], 
    taskFields: TaskField[], 
    statuses: Status[], 
    fileDate: string,
    translations: any
) => {
    const t = translations;
    if (data.length < 2) {
        throw new Error("Sheet appears to be empty or missing data rows.");
    }

    // 1. Анализ заголовков
    const headers = (data[0] as any[]).map(h => h?.toString().trim().toLowerCase());
    const columnMapping: Record<string, number> = {};

    taskFields.forEach(field => {
        const targetTitle = field.title.toLowerCase();
        const index = headers.findIndex(h => h === targetTitle);
        if (index !== -1) {
            columnMapping[field.key] = index;
        }
    });

    // 2. Проверка обязательных колонок
    const missingFields = taskFields
        .filter(f => f.required && columnMapping[f.key] === undefined)
        .map(f => f.title);

    if (missingFields.length > 0) {
        throw new Error(`${t.missingColumns || "Missing columns"}: ${missingFields.join(", ")}`);
    }

    const rows = data.slice(1);
    const parsedTasks: any[] = [];
    const validationErrors: string[] = [];

    rows.forEach((row, index) => {
        const rowIndex = index + 2; 
        const r = row as any[];
        
        if (!r || r.length === 0) return; 

        const isEmpty = Object.values(columnMapping).every(colIdx => {
            const val = r[colIdx];
            return val === undefined || val === null || val.toString().trim() === '';
        });
        if (isEmpty) return;

        const taskData: any = {};
        let rowIsValid = true;

        taskFields.forEach((field) => {
            if (!rowIsValid) return;

            const colIdx = columnMapping[field.key];
            if (colIdx === undefined) {
                taskData[field.key] = field.type === 'number' ? 0 : "";
                return;
            }

            let rawValue = r[colIdx];
            let finalValue: any = rawValue;

            if (field.required && (rawValue === undefined || rawValue === null || rawValue.toString().trim() === "")) {
                validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ${t.fieldIsEmpty}`);
                rowIsValid = false;
                return;
            }

            if (field.type === 'number') {
                if (rawValue !== undefined && rawValue !== null && rawValue.toString().trim() !== "") {
                    const num = Number(rawValue.toString().trim().replace(',', '.'));
                    if (isNaN(num)) {
                        validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ("${rawValue}") ${t.mustBeNumber}`);
                        rowIsValid = false;
                        return;
                    }
                    finalValue = num;
                } else {
                    finalValue = 0;
                }
            } 
            else if (field.type === 'date') {
                const parsedDate = parseDateStrict(rawValue);
                if (field.required && !parsedDate) {
                    validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ("${rawValue}") - ${t.invalidValue}`);
                    rowIsValid = false;
                    return;
                }
                finalValue = parsedDate || new Date(fileDate).toISOString();
            }
            else if (field.key === 'status') {
                const strVal = rawValue?.toString().trim();
                if (strVal && !statuses.some(s => s.title === strVal)) {
                    validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ("${strVal}") - ${t.invalidValue}`);
                    rowIsValid = false;
                    return;
                }
                finalValue = strVal || "";
            }
            else {
                finalValue = rawValue?.toString().trim() || "";
            }

            taskData[field.key] = finalValue;
        });

        if (rowIsValid) parsedTasks.push(taskData);
    });

    return { parsedTasks, validationErrors };
};
