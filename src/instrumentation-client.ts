import { initBotId } from "botid/client/core";

// BotID: niewidoczna weryfikacja na logowaniu i na akcjach zapisujących stan.
// Wynik sprawdza serwer (checkBotId) przed zapisem.
initBotId({
  protect: [
    { path: "/login", method: "POST" },
    { path: "/rejestracja", method: "POST" },
    { path: "/api/akcja", method: "POST" },
    { path: "/api/obecnosc/checkin", method: "POST" },
    { path: "/api/obecnosc/checkout", method: "POST" },
    { path: "/api/rezerwacje", method: "POST" },
  ],
});
