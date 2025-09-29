import * as backend from "../wailsjs/go/main/App";

async function loadPage(file) {
    const resp = await fetch(`./src/pages/${file}.html`);
    if (!resp.ok) throw new Error(`Не удалось загрузить ${file}.html`);
    return await resp.text();
}

export async function HomePage(navigate) {
    const container = document.createElement("div");
    container.innerHTML = await loadPage("home");

    // Подгружаем список репозиториев из Go
    async function renderRepos() {
        try {
            const repos = await backend.GetRepositories();
            const grid = container.querySelector(".repo-grid");

            // очистить, оставить только кнопку добавления
            grid.querySelectorAll(".repo-card").forEach(el => {
                if (el.id !== "addRepoBtn") el.remove();
            });

            repos.forEach(r => {
                const card = document.createElement("div");
                card.className = "repo-card";

                const actions = document.createElement("div");
                actions.className = "repo-actions";

                const editBtn = document.createElement("button");
                editBtn.className = "repo-action-btn";
                editBtn.title = "Изменить проект Jira";
                editBtn.textContent = "⚙";
                editBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openEditRepoModal(r.ID);
                });

                const delBtn = document.createElement("button");
                delBtn.className = "repo-action-btn";
                delBtn.title = "Удалить репозиторий";
                delBtn.textContent = "🗑";
                delBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (!confirm("Удалить репозиторий?")) return;
                    try {
                        await backend.DeleteRepository(r.ID);
                        await renderRepos();
                    } catch (err) {
                        console.error("Ошибка удаления:", err);
                    }
                });

                actions.appendChild(editBtn);
                actions.appendChild(delBtn);

                const img = document.createElement("img");
                img.src = r.JiraAvatar || "";
                if (!r.JiraAvatar) img.classList.add("hidden");
                img.onerror = async () => {
                    try {
                        const dataUrl = await backend.GetJiraProjectAvatar(r.JiraKey);
                        if (dataUrl) {
                            img.src = dataUrl;
                            img.classList.remove("hidden");
                        }
                    } catch (e) {
                    }
                };

                const title = document.createElement("div");
                title.className = "repo-title";
                title.textContent = r.JiraName || r.Name;

                const subtitle = document.createElement("div");
                subtitle.textContent = r.JiraKey ? `(${r.JiraKey})` : "";
                subtitle.style.color = "#666";
                subtitle.style.fontSize = "12px";

                // навигация по клику на карточку (кроме кнопок)
                card.addEventListener("click", () => {
                    navigate("repo:" + r.ID);
                });

                card.appendChild(actions);
                card.appendChild(img);
                card.appendChild(title);
                card.appendChild(subtitle);

                grid.insertBefore(card, grid.querySelector("#addRepoBtn"));
            });
        } catch (err) {
            console.error("Ошибка получения репозиториев:", err);
        }
    }

    await renderRepos();

    // Кнопка "добавить репозиторий"
    const addBtn = container.querySelector("#addRepoBtn");
    addBtn.addEventListener("click", async () => {
        const modal = container.querySelector("#modal");
        const repoPathInput = container.querySelector("#repoPath");
        const jiraSelect = container.querySelector("#jiraSelect");

        modal.classList.remove("hidden");

        // Загружаем проекты из Jira с бэкенда
        try {
            const projects = await backend.GetJiraProjects();
            jiraSelect.innerHTML = (projects || [])
                .map(p => `<option value="${p.Key}">${p.Name} (${p.Key})</option>`)
                .join("");
        } catch (err) {
            console.error("Ошибка загрузки проектов Jira:", err);
        }

        // Сохранение
        container.querySelector("#saveRepoBtn").onclick = async () => {
            const path = repoPathInput.value;
            const jiraKey = jiraSelect.value;

            if (!path || !jiraKey) {
                alert("Заполните все поля!");
                return;
            }

            try {
                await backend.AddRepository(path, jiraKey);
                alert("Репозиторий добавлен!");
                modal.classList.add("hidden");
                await renderRepos();
            } catch (err) {
                console.error("Ошибка добавления:", err);
            }
        };

        // Отмена
        container.querySelector("#cancelBtn").onclick = () => {
            modal.classList.add("hidden");
        };

        // Закрытие по клику вне окна
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.classList.add("hidden");
            }
        }, { once: true });
    });

    // Редактирование проекта репозитория
    const openEditRepoModal = async (repoId) => {
        const editModal = container.querySelector("#editRepoModal");
        const editSelect = container.querySelector("#editJiraSelect");

        // загрузить проекты
        try {
            const projects = await backend.GetJiraProjects();
            editSelect.innerHTML = (projects || [])
                .map(p => `<option value="${p.Key}">${p.Name} (${p.Key})</option>`)
                .join("");
        } catch (e) {
            console.error("Ошибка загрузки проектов Jira:", e);
        }

        editModal.classList.remove("hidden");

        container.querySelector("#editSaveBtn").onclick = async () => {
            const key = editSelect.value;
            if (!key) { alert("Выберите проект"); return; }
            try {
                await backend.UpdateRepositoryJira(repoId, key);
                editModal.classList.add("hidden");
                await renderRepos();
            } catch (e) {
                console.error("Ошибка обновления репозитория:", e);
            }
        };
        container.querySelector("#editCancelBtn").onclick = () => {
            editModal.classList.add("hidden");
        };
        editModal.addEventListener("click", (event) => {
            if (event.target === editModal) {
                editModal.classList.add("hidden");
            }
        }, { once: true });
    };

    // Jira статус + авторизация/выход
    const header = container.querySelector(".header");
    const jiraBtn = container.querySelector("#jiraLoginBtn");
    const statusSpan = container.querySelector("#jiraStatus");
    const avatarImg = container.querySelector("#jiraAvatar");
    const nameSpan = container.querySelector("#jiraName");

    const openJiraModal = async () => {
        const jiraModal = container.querySelector("#jiraModal");
        const serverInput = container.querySelector("#jiraServer");
        const usernameInput = container.querySelector("#jiraUsername");
        const passwordInput = container.querySelector("#jiraPassword");

        // Подгружаем сохранённые данные
        try {
            const creds = await backend.GetJiraCredentials();
            if (creds) {
                serverInput.value = creds.Server || "";
                usernameInput.value = creds.Username || "";
                passwordInput.value = creds.Password || "";
            }
        } catch (e) {
            console.error("Не удалось получить Jira-данные:", e);
        }

        jiraModal.classList.remove("hidden");

        // Сохранить
        container.querySelector("#jiraSaveBtn").onclick = async () => {
            const server = serverInput.value.trim();
            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!server || !username || !password) {
                alert("Заполните все поля");
                return;
            }

            try {
                const errMsg = await backend.SaveJiraCredentials(server, username, password);
                if (errMsg) { alert(errMsg); return; }
                alert("Данные Jira сохранены");
                jiraModal.classList.add("hidden");
                await refreshJiraStatus();
            } catch (e) {
                console.error("Ошибка сохранения Jira:", e);
            }
        };

        // Отмена
        container.querySelector("#jiraCancelBtn").onclick = () => {
            jiraModal.classList.add("hidden");
        };

        // Закрытие по клику вне окна
        jiraModal.addEventListener("click", (event) => {
            if (event.target === jiraModal) {
                jiraModal.classList.add("hidden");
            }
        }, { once: true });
    };

    const logoutJira = async () => {
        try {
            await backend.DeleteJiraCredentials();
            await refreshJiraStatus();
        } catch (e) {
            console.error("Ошибка выхода из Jira:", e);
        }
    };

    async function refreshJiraStatus() {
        try {
            const creds = await backend.GetJiraCredentials();
            const loggedIn = !!(creds && creds.Server && creds.Username);
            if (loggedIn) {
                const profile = await backend.GetJiraProfile();
                if (profile && profile.DisplayName) {
                    nameSpan.textContent = profile.DisplayName;
                    nameSpan.classList.remove("hidden");
                } else {
                    nameSpan.textContent = creds.Username;
                    nameSpan.classList.remove("hidden");
                }
                if (profile && profile.AvatarURL) {
                    avatarImg.src = profile.AvatarURL;
                    avatarImg.classList.remove("hidden");
                } else {
                    avatarImg.classList.add("hidden");
                }
                statusSpan.textContent = "Jira: авторизован";
                jiraBtn.textContent = "Выйти из Jira";
                jiraBtn.onclick = logoutJira;
            } else {
                nameSpan.textContent = "";
                nameSpan.classList.add("hidden");
                avatarImg.src = "";
                avatarImg.classList.add("hidden");
                statusSpan.textContent = "Jira: не авторизован";
                jiraBtn.textContent = "🔑 Авторизация в Jira";
                jiraBtn.onclick = openJiraModal;
            }
        } catch (e) {
            console.error("Ошибка получения статуса Jira:", e);
            nameSpan.textContent = "";
            nameSpan.classList.add("hidden");
            avatarImg.src = "";
            avatarImg.classList.add("hidden");
            statusSpan.textContent = "Jira: ошибка статуса";
            jiraBtn.textContent = "🔑 Авторизация в Jira";
            jiraBtn.onclick = openJiraModal;
        }
    }

    await refreshJiraStatus();

    return container;
}

export async function RepoPage(navigate, repoId) {
    const container = document.createElement("div");
    container.innerHTML = await loadPage("repo");

    // back button
    const backBtn = container.querySelector("#backBtn");
    backBtn.addEventListener("click", () => navigate("home"));

    // title
    try {
        const repos = await backend.GetRepositories();
        const current = (repos || []).find(r => r.ID === repoId);
        if (current) {
            container.querySelector("#repoTitle").textContent = current.JiraName || current.Name;
        }
    } catch {}

    // load commits
    try {
        const commits = await backend.GetRepoCommits(repoId);
        const tbody = container.querySelector("#commitsTable tbody");
        tbody.innerHTML = (commits || []).map(c => (
            `<tr>`+
            `<td>${c.Hash}</td>`+
            `<td>${c.Author}</td>`+
            `<td>${c.Date}</td>`+
            `<td>${c.Message}</td>`+
            `</tr>`
        )).join("");
    } catch (e) {
        console.error("Ошибка загрузки коммитов:", e);
    }

    // load merge candidates
    try {
        const merges = await backend.GetMergeCandidates(repoId);
        const tbody = container.querySelector("#mergeTable tbody");
        tbody.innerHTML = (merges || []).map(c => (
            `<tr>`+
            `<td>${c.Hash}</td>`+
            `<td>${c.Author}</td>`+
            `<td>${c.Date}</td>`+
            `<td>${c.Message}</td>`+
            `</tr>`
        )).join("");
    } catch (e) {
        console.error("Ошибка загрузки кандидатов на merge:", e);
    }

    return container;
}
