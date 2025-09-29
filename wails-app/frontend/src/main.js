// src/main.js
import { HomePage, RepoPage } from "./pages.js";

const app = document.getElementById("app");

async function navigate(page) {
    app.innerHTML = "Загрузка..."; // можно сделать спиннер

    let screen;
    if (page === "home") {
        screen = await HomePage(navigate);
    } else if (page.startsWith("repo:")) {
        const idStr = page.split(":")[1];
        const repoId = parseInt(idStr, 10);
        screen = await RepoPage(navigate, repoId);
    } else {
        screen = document.createTextNode("Страница не найдена");
    }

    app.innerHTML = ""; // очищаем
    app.appendChild(screen);
}

// запуск
navigate("home");

// // src/main.js
// import { HomePage, RepoPage } from "./pages.js";
//
// const app = document.getElementById("app");
//
// function navigate(page) {
//     app.innerHTML = ""; // очистить контейнер
//
//     let screen;
//     switch (page) {
//         case "home":
//             screen = HomePage(navigate);
//             break;
//         case "repo":
//             screen = RepoPage(navigate);
//             break;
//         default:
//             screen = document.createTextNode("Страница не найдена");
//     }
//
//     app.appendChild(screen);
// }
//
// // Запуск с главной
// navigate("home");

// import './style.css';
// import './app.css';
//
// import logo from './assets/images/logo-universal.png';
// import {Greet} from '../wailsjs/go/main/App';
//
// document.querySelector('#app').innerHTML = `
//     <img id="logo" class="logo">
//       <div class="result" id="result">Please enter your name below 👇</div>
//       <div class="input-box" id="input">
//         <input class="input" id="name" type="text" autocomplete="off" />
//         <button class="btn" onclick="greet()">Greet</button>
//       </div>
//     </div>
// `;
// document.getElementById('logo').src = logo;
//
// let nameElement = document.getElementById("name");
// nameElement.focus();
// let resultElement = document.getElementById("result");
//
// // Setup the greet function
// window.greet = function () {
//     // Get name
//     let name = nameElement.value;
//
//     // Check if the input is empty
//     if (name === "") return;
//
//     // Call App.Greet(name)
//     try {
//         Greet(name)
//             .then((result) => {
//                 // Update result with data back from App.Greet()
//                 resultElement.innerText = result;
//             })
//             .catch((err) => {
//                 console.error(err);
//             });
//     } catch (err) {
//         console.error(err);
//     }
// };
