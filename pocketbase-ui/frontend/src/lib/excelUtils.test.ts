/**
 * Unit tests for Excel utilities
 * Note: These tests are designed to be run with Vitest or Jest.
 */
import { parseDateStrict, getFormattedDateForCheck, validateAndParseExcelRows } from './excelUtils';
import { TaskField, Status } from './SettingsContext';

// Mock dependencies
const mockFields: TaskField[] = [
    { id: '1', key: 'task_number', title: '№ Задачи', type: 'text', required: true, width: '100px', filterable: true, order: 0 },
    { id: '2', key: 'time_spent', title: 'Затрачено', type: 'number', required: true, width: '100px', filterable: true, order: 1 }
];

const mockStatuses: Status[] = [
    { id: 's1', title: 'Завершена', slug: 'completed', color: 'green', type: 'final' }
];

const mockTranslations = {
    row: "Row",
    fieldIsEmpty: "is empty",
    mustBeNumber: "must be number",
    invalidValue: "invalid"
};

// 1. Test Date Prefix Formatting
console.log("Testing getFormattedDateForCheck...");
const prefix = getFormattedDateForCheck("2025-12-25");
if (prefix === "25.12.2025") {
    console.log("✅ getFormattedDateForCheck passed");
} else {
    console.error("❌ getFormattedDateForCheck failed:", prefix);
}

// 2. Test Excel Date Parsing
console.log("Testing parseDateStrict...");
const parsedDate = parseDateStrict("25.12.2025");
if (parsedDate && parsedDate.includes("2025-12-25")) {
    console.log("✅ parseDateStrict passed");
} else {
    console.error("❌ parseDateStrict failed:", parsedDate);
}

// 3. Test Row Validation Logic
console.log("Testing validateAndParseExcelRows...");
const mockData = [
    ["№ Задачи", "Затрачено"], // Headers
    ["TASK-101", "2.5"],       // Valid row
    ["", "invalid"]            // Invalid row (empty key, wrong type)
];

const { parsedTasks, validationErrors } = validateAndParseExcelRows(
    mockData, 
    mockFields, 
    mockStatuses, 
    "2025-12-25", 
    mockTranslations
);

if (parsedTasks.length === 1 && parsedTasks[0].task_number === "TASK-101") {
    console.log("✅ Row parsing passed");
} else {
    console.error("❌ Row parsing failed");
}

if (validationErrors.length > 0) {
    console.log("✅ Error detection passed (caught invalid number)");
} else {
    console.error("❌ Error detection failed");
}
