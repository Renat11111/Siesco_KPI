package main

import (
	"testing"
)

func TestNormalizeStatus(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"  Completed  ", "completed"},
		{"завершена", "завершена"},
		{"IN_PROGRESS", "in_progress"},
	}

	for _, c := range cases {
		result := normalizeStatus(c.input)
		if result != c.expected {
			t.Errorf("normalizeStatus(%q) == %q, want %q", c.input, result, c.expected)
		}
	}
}

func TestIsValidMonth(t *testing.T) {
	if !isValidMonth("2025-12") {
		t.Error("2025-12 should be a valid month")
	}
	if isValidMonth("2025-13") {
		t.Error("2025-13 should NOT be a valid month")
	}
	if isValidMonth("25-12") {
		t.Error("25-12 should NOT be a valid month")
	}
}

func TestIsValidYear(t *testing.T) {
	if !isValidYear("2025") {
		t.Error("2025 should be a valid year")
	}
	if isValidYear("202") {
		t.Error("202 should NOT be a valid year")
	}
}

func TestIsValidDateTime(t *testing.T) {
	if !isValidDateTime("2025-12-25 10:00:00") {
		t.Error("Format YYYY-MM-DD HH:MM:SS should be valid")
	}
	if !isValidDateTime("2025-12-25") {
		t.Error("Format YYYY-MM-DD should be valid")
	}
	if isValidDateTime("25.12.2025") {
		t.Error("Format DD.MM.YYYY should NOT be valid (Go style)")
	}
}
