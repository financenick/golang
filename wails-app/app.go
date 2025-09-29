package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	_ "github.com/mattn/go-sqlite3"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"log"
	"net/http"
	"strings"
	"time"
)

type Repository struct {
	ID         int
	Name       string
	Path       string
	JiraKey    string
	JiraName   string
	JiraAvatar string
}

type JiraCredentials struct {
	Server   string
	Username string
	Password string
}

type JiraProject struct {
	Key       string
	Name      string
	AvatarURL string
}

type JiraProfile struct {
	DisplayName string
	AvatarURL   string
}

type App struct {
	ctx context.Context
	db  *sql.DB
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	runtime.LogInfo(ctx, "Приложение запущено")
	// Открываем/создаём базу
	db, err := sql.Open("sqlite3", "./repos.db")
	if err != nil {
		log.Fatal(err)
	}
	a.db = db

	// Создаём таблицу, если её ещё нет
	createTable := `
	CREATE TABLE IF NOT EXISTS repositories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT,
		path TEXT,
		jira TEXT
	);
	`
	_, err = db.Exec(createTable)
	if err != nil {
		log.Fatal(err)
	}

	// Миграция: добавляем новые столбцы под Jira проект
	// sqlite допускает ADD COLUMN; если уже существует, будет ошибка — игнорируем
	_, _ = db.Exec("ALTER TABLE repositories ADD COLUMN jira_key TEXT")
	_, _ = db.Exec("ALTER TABLE repositories ADD COLUMN jira_name TEXT")
	_, _ = db.Exec("ALTER TABLE repositories ADD COLUMN jira_avatar TEXT")

	// Таблица для хранения Jira-учётных данных (одна запись)
	createJiraTable := `
	CREATE TABLE IF NOT EXISTS jira_credentials (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		server TEXT,
		username TEXT,
		password TEXT
	);
	`
	_, err = db.Exec(createJiraTable)
	if err != nil {
		log.Fatal(err)
	}
}

func NewApp() *App { return &App{} }

func (a *App) GetRepositories() []Repository {
	rows, err := a.db.Query("SELECT id, name, path, COALESCE(jira_key, ''), COALESCE(jira_name, ''), COALESCE(jira_avatar, '') FROM repositories")
	if err != nil {
		log.Println("Ошибка при чтении:", err)
		return nil
	}
	defer rows.Close()

	var repos []Repository
	for rows.Next() {
		var r Repository
		rows.Scan(&r.ID, &r.Name, &r.Path, &r.JiraKey, &r.JiraName, &r.JiraAvatar)
		repos = append(repos, r)
	}
	return repos
}

// AddRepository принимает путь и ключ проекта Jira. Детали проекта подтягиваются из API и сохраняются вместе с репо.
func (a *App) AddRepository(path string, jiraProjectKey string) {
	name := path // можно улучшить извлечение имени
	var pj JiraProject
	if jiraProjectKey != "" {
		// ищем проект по ключу
		projects := a.GetJiraProjects()
		for _, p := range projects {
			if strings.EqualFold(p.Key, jiraProjectKey) {
				pj = p
				break
			}
		}
	}
	_, err := a.db.Exec(
		"INSERT INTO repositories(name, path, jira_key, jira_name, jira_avatar) VALUES (?, ?, ?, ?, ?)",
		name, path, pj.Key, pj.Name, pj.AvatarURL,
	)
	if err != nil {
		log.Println("Ошибка при добавлении:", err)
	}
}

// Обновить Jira-проект для репозитория по id
func (a *App) UpdateRepositoryJira(repoID int, jiraProjectKey string) {
	projects := a.GetJiraProjects()
	var pj JiraProject
	for _, p := range projects {
		if strings.EqualFold(p.Key, jiraProjectKey) { pj = p; break }
	}
	_, err := a.db.Exec(
		"UPDATE repositories SET jira_key = ?, jira_name = ?, jira_avatar = ? WHERE id = ?",
		pj.Key, pj.Name, pj.AvatarURL, repoID,
	)
	if err != nil {
		log.Println("Ошибка обновления проекта Jira:", err)
	}
}

// Сохранение Jira-учётных данных с предварительной проверкой
// Возвращает пустую строку при успехе, либо текст ошибки
func (a *App) SaveJiraCredentials(server, username, password string) string {
	if server == "" || username == "" || password == "" { return "Заполните все поля" }

	normalized, err := normalizeJiraBaseURL(server)
	if err != nil { return err.Error() }
	if err := validateJiraCredentials(normalized, username, password); err != nil { return err.Error() }

	_, dbErr := a.db.Exec(
		"INSERT INTO jira_credentials(id, server, username, password) VALUES (1, ?, ?, ?) "+
			"ON CONFLICT(id) DO UPDATE SET server=excluded.server, username=excluded.username, password=excluded.password",
		normalized, username, password,
	)
	if dbErr != nil {
		log.Println("Ошибка сохранения Jira-данных:", dbErr)
		return "Не удалось сохранить данные Jira"
	}
	return ""
}

func (a *App) GetJiraCredentials() JiraCredentials {
	var creds JiraCredentials
	row := a.db.QueryRow("SELECT server, username, password FROM jira_credentials WHERE id=1")
	_ = row.Scan(&creds.Server, &creds.Username, &creds.Password)
	return creds
}

// Реальное получение проектов из Jira
func (a *App) GetJiraProjects() []JiraProject {
	creds := a.GetJiraCredentials()
	if creds.Server == "" || creds.Username == "" || creds.Password == "" {
		return nil
	}
	projects, err := fetchJiraProjects(creds.Server, creds.Username, creds.Password)
	if err != nil {
		log.Println("Ошибка получения проектов Jira:", err)
		return nil
	}
	return projects
}

func (a *App) GetJiraProfile() JiraProfile {
	creds := a.GetJiraCredentials()
	if creds.Server == "" || creds.Username == "" || creds.Password == "" { return JiraProfile{} }
	profile, err := fetchJiraProfile(creds.Server, creds.Username, creds.Password)
	if err != nil {
		log.Println("Не удалось получить профиль Jira:", err)
		return JiraProfile{}
	}
	return profile
}

func (a *App) DeleteJiraCredentials() {
	_, err := a.db.Exec("DELETE FROM jira_credentials WHERE id=1")
	if err != nil { log.Println("Ошибка удаления Jira-данных:", err) }
}

func (a *App) GetJiraProjectAvatar(projectKey string) string {
	if projectKey == "" { return "" }
	creds := a.GetJiraCredentials()
	if creds.Server == "" || creds.Username == "" || creds.Password == "" { return "" }

	projects, err := fetchJiraProjects(creds.Server, creds.Username, creds.Password)
	if err != nil { return "" }
	var avatarURL string
	for _, p := range projects {
		if strings.EqualFold(p.Key, projectKey) {
			avatarURL = p.AvatarURL
			break
		}
	}
	if avatarURL == "" { return "" }
	if strings.HasPrefix(avatarURL, "/") {
		avatarURL = creds.Server + avatarURL
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", avatarURL, nil)
	authHeader := "Basic " + base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", creds.Username, creds.Password)))
	req.Header.Set("Authorization", authHeader)
	resp, err := client.Do(req)
	if err != nil { return "" }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK { return "" }
	b, err := io.ReadAll(resp.Body)
	if err != nil { return "" }
	ct := resp.Header.Get("Content-Type")
	if ct == "" { ct = "image/png" }
	enc := base64.StdEncoding.EncodeToString(b)
	return fmt.Sprintf("data:%s;base64,%s", ct, enc)
}

func (a *App) DeleteRepository(id int) {
	_, err := a.db.Exec("DELETE FROM repositories WHERE id = ?", id)
	if err != nil {
		log.Println("Ошибка удаления репозитория:", err)
	}
}

// --- helpers ---

func normalizeJiraBaseURL(server string) (string, error) {
	s := strings.TrimSpace(server)
	if s == "" { return "", errors.New("Адрес сервера пустой") }
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") { s = "https://" + s }
	s = strings.TrimRight(s, "/")
	return s, nil
}

func validateJiraCredentials(baseURL, username, password string) error {
	client := &http.Client{Timeout: 10 * time.Second}
	endpoints := []string{"/rest/api/3/myself", "/rest/api/2/myself"}
	authHeader := "Basic " + base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", username, password)))
	for _, ep := range endpoints {
		req, _ := http.NewRequest("GET", baseURL+ep, nil)
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Accept", "application/json")
		resp, err := client.Do(req)
		if err != nil { continue }
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK { return nil }
		if resp.StatusCode == http.StatusUnauthorized { return errors.New("Неверные логин или пароль/API токен") }
	}
	return errors.New("Не удалось подключиться к Jira. Проверьте адрес сервера")
}

// fetchJiraProjects gets projects and returns key, name, avatar
func fetchJiraProjects(baseURL, username, password string) ([]JiraProject, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	authHeader := "Basic " + base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", username, password)))

	// Try Cloud v3: /project/search
	type v3Project struct {
		Key        string            `json:"key"`
		Name       string            `json:"name"`
		AvatarUrls map[string]string `json:"avatarUrls"`
	}
	type v3Resp struct { Values []v3Project `json:"values"` }

	if req, _ := http.NewRequest("GET", baseURL+"/rest/api/3/project/search", nil); true {
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Accept", "application/json")
		if resp, err := client.Do(req); err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var data v3Resp
			if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
				var out []JiraProject
				for _, p := range data.Values {
					out = append(out, JiraProject{Key: p.Key, Name: p.Name, AvatarURL: pickAvatar(p.AvatarUrls)})
				}
				return out, nil
			}
		}
	}

	// Try Server/DC v2: /project
	type v2Project struct {
		Key        string            `json:"key"`
		Name       string            `json:"name"`
		AvatarUrls map[string]string `json:"avatarUrls"`
	}

	req2, _ := http.NewRequest("GET", baseURL+"/rest/api/2/project", nil)
	req2.Header.Set("Authorization", authHeader)
	req2.Header.Set("Accept", "application/json")
	resp2, err2 := client.Do(req2)
	if err2 != nil { return nil, err2 }
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK { return nil, fmt.Errorf("jira projects status %d", resp2.StatusCode) }
	var list []v2Project
	if err := json.NewDecoder(resp2.Body).Decode(&list); err != nil { return nil, err }
	var out []JiraProject
	for _, p := range list {
		out = append(out, JiraProject{Key: p.Key, Name: p.Name, AvatarURL: pickAvatar(p.AvatarUrls)})
	}
	return out, nil
}

func fetchJiraProfile(baseURL, username, password string) (JiraProfile, error) {
	type avatarMap map[string]string
	type myselfResp struct {
		DisplayName string    `json:"displayName"`
		AvatarUrls  avatarMap `json:"avatarUrls"`
	}
	client := &http.Client{Timeout: 10 * time.Second}
	endpoints := []string{"/rest/api/3/myself", "/rest/api/2/myself"}
	authHeader := "Basic " + base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", username, password)))
	for _, ep := range endpoints {
		req, _ := http.NewRequest("GET", baseURL+ep, nil)
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Accept", "application/json")
		resp, err := client.Do(req)
		if err != nil { continue }
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK { continue }
		var data myselfResp
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil { return JiraProfile{}, err }
		return JiraProfile{DisplayName: data.DisplayName, AvatarURL: pickAvatar(data.AvatarUrls)}, nil
	}
	return JiraProfile{}, errors.New("Профиль Jira недоступен")
}

func pickAvatar(m map[string]string) string {
	if m == nil { return "" }
	if v, ok := m["48x48"]; ok { return v }
	if v, ok := m["32x32"]; ok { return v }
	for _, v := range m { return v }
	return ""
}
