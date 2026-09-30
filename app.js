// ============================================================
// CARMATCH AI - FINAL FRONTEND v10
// ============================================================
// One frontend implementation only.
// No duplicated inline JavaScript.
// Robust object handling.
// Supabase anonymous authentication.
// 5 searches/day through backend.
// Exactly 3 results.
// Safe error handling.
// Image candidates.
// Vibration + sound.
// ============================================================

"use strict";

const CONFIG = window.CARMATCH_CONFIG || {
    supabaseUrl: "",
    supabaseAnonKey: "",
    apiEndpoint: "/api/search"
};

let supabaseClient = null;
let initialized = false;
let searching = false;


// ============================================================
// SAFE TEXT
// ============================================================

function safeDisplayText(value, fallback = "") {
    if (value === null || value === undefined) {
        return fallback;
    }

    if (typeof value === "string") {
        const text = value.trim();
        return text || fallback;
    }

    if (
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value
            .map(item => safeDisplayText(item, ""))
            .filter(Boolean)
            .join(", ") || fallback;
    }

    if (typeof value === "object") {
        const preferredKeys = [
            "message",
            "error",
            "text",
            "value",
            "name",
            "description",
            "reason",
            "title"
        ];

        for (const key of preferredKeys) {
            if (
                Object.prototype.hasOwnProperty.call(value, key) &&
                value[key] !== null &&
                value[key] !== undefined
            ) {
                const result = safeDisplayText(value[key], "");
                if (result) {
                    return result;
                }
            }
        }

        try {
            const json = JSON.stringify(value);
            return json && json !== "{}"
                ? json
                : fallback;
        } catch {
            return fallback;
        }
    }

    return fallback;
}


// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHTML(value) {
    return safeDisplayText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {
    return escapeHTML(value);
}


// ============================================================
// DOM
// ============================================================

function get(id) {
    return document.getElementById(id);
}


function getSearchButton() {
    return (
        get("searchButton") ||
        document.querySelector(".find")
    );
}


function getResultsElement() {
    return (
        get("results") ||
        get("output")
    );
}


function getStatusElement() {
    return get("status");
}


// ============================================================
// STATUS
// ============================================================

function setStatus(message, type = "") {
    const element = getStatusElement();

    if (!element) {
        return;
    }

    element.className = "status";

    if (type) {
        element.classList.add(type);
    }

    element.textContent = safeDisplayText(message);
}


function clearStatus() {
    const element = getStatusElement();

    if (!element) {
        return;
    }

    element.textContent = "";
    element.className = "status";
}


// ============================================================
// BUTTON
// ============================================================

function setButtonBusy(busy) {
    const button = getSearchButton();

    if (!button) {
        return;
    }

    searching = busy;
    button.disabled = busy || !initialized;
    button.classList.toggle("loading", busy);

    const normalText = button.querySelector(".button-text");
    const loadingText = button.querySelector(".button-loading");

    if (normalText) {
        normalText.hidden = busy;
    }

    if (loadingText) {
        loadingText.hidden = !busy;
    }
}


// ============================================================
// SUPABASE
// ============================================================

function isSupabaseConfigValid() {
    return (
        typeof CONFIG.supabaseUrl === "string" &&
        CONFIG.supabaseUrl.startsWith("http") &&
        typeof CONFIG.supabaseAnonKey === "string" &&
        CONFIG.supabaseAnonKey.length > 20
    );
}


function waitForSupabase() {
    return new Promise((resolve, reject) => {
        const started = Date.now();

        const check = () => {
            if (
                window.supabase &&
                typeof window.supabase.createClient === "function"
            ) {
                resolve(window.supabase);
                return;
            }

            if (Date.now() - started > 10000) {
                reject(
                    new Error(
                        "Supabase sa nepodarilo načítať."
                    )
                );
                return;
            }

            setTimeout(check, 100);
        };

        check();
    });
}


async function getSupabaseClient() {
    if (supabaseClient) {
        return supabaseClient;
    }

    if (!isSupabaseConfigValid()) {
        throw new Error(
            "Supabase konfigurácia nie je nastavená."
        );
    }

    const supabase = await waitForSupabase();

    supabaseClient = supabase.createClient(
        CONFIG.supabaseUrl,
        CONFIG.supabaseAnonKey,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        }
    );

    return supabaseClient;
}


async function ensureAnonymousSession() {
    const client = await getSupabaseClient();

    const existing = await client.auth.getSession();

    if (existing?.data?.session?.access_token) {
        return existing.data.session;
    }

    const result = await client.auth.signInAnonymously();

    if (result.error) {
        throw new Error(
            safeDisplayText(
                result.error.message,
                "Nepodarilo sa vytvoriť anonymnú reláciu."
            )
        );
    }

    if (!result.data?.session) {
        throw new Error(
            "Supabase nevytvoril platnú reláciu."
        );
    }

    return result.data.session;
}


async function getAccessToken(forceRefresh = false) {
    const client = await getSupabaseClient();

    if (forceRefresh) {
        const refreshed = await client.auth.refreshSession();

        if (refreshed.error) {
            throw new Error(
                safeDisplayText(
                    refreshed.error.message,
                    "Reláciu sa nepodarilo obnoviť."
                )
            );
        }

        return refreshed.data?.session?.access_token || null;
    }

    const session = await ensureAnonymousSession();

    return session?.access_token || null;
}


// ============================================================
// INPUT
// ============================================================

function readValue(id) {
    const element = get(id);

    if (!element) {
        return "";
    }

    return safeDisplayText(element.value, "");
}


function readNumber(id) {
    const value = readValue(id);

    if (!value) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}


function getNaturalLanguage() {
    const ids = [
        "aiRequest",
        "naturalLanguage",
        "query",
        "prompt",
        "request",
        "search",
        "message"
    ];

    for (const id of ids) {
        const value = readValue(id);

        if (value) {
            return value;
        }
    }

    return "";
}


function getAvoidBrands() {
    const value = readValue("avoid");

    if (!value) {
        return "";
    }

    return value;
}


// ============================================================
// REQUEST
// ============================================================

function buildRequestPayload() {
    return {
        naturalLanguage: getNaturalLanguage(),

        filters: {
            budget: readNumber("budget"),
            seats: readNumber("seats"),
            power: readNumber("power"),
            trunk: readNumber("trunk"),

            drive: readValue("drive"),
            fuel: readValue("fuel"),
            body: readValue("body"),
            style: readValue("style"),
            length: readNumber("length"),
            year: readNumber("year"),
            avoid: getAvoidBrands()
        }
    };
}


function hasSearchInput(payload) {
    if (payload.naturalLanguage?.trim()) {
        return true;
    }

    const filters = payload.filters || {};

    return Object.values(filters).some(value => {
        if (value === null || value === undefined) {
            return false;
        }

        return String(value).trim() !== "";
    });
}


// ============================================================
// API RESPONSE
// ============================================================

async function parseResponse(response) {
    const raw = await response.text();

    if (!raw) {
        return {};
    }

    try {
        return JSON.parse(raw);
    } catch {
        return {
            error: "Invalid JSON response",
            message: raw
        };
    }
}


function createApiError(response, data) {
    const fallback = `Server returned HTTP ${response.status}.`;

    const message = safeDisplayText(
        data?.message ??
        data?.error ??
        data?.detail ??
        data,
        fallback
    );

    const error = new Error(message);

    error.status = response.status;
    error.data = data;

    return error;
}


// ============================================================
// SEARCH
// ============================================================

async function performSearch(payload) {
    let token = await getAccessToken(false);

    if (!token) {
        throw new Error(
            "Nepodarilo sa získať prístupový token."
        );
    }

    const sendRequest = async accessToken => {
        return fetch(CONFIG.apiEndpoint, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },

            body: JSON.stringify(payload)
        });
    };

    let response;

    try {
        response = await sendRequest(token);
    } catch (error) {
        const message = safeDisplayText(
            error?.message,
            "Failed to fetch"
        );

        const networkError = new Error(
            `Nepodarilo sa spojiť so serverom. ${message}`
        );

        networkError.network = true;

        throw networkError;
    }

    let data = await parseResponse(response);

    // Retry once if token expired.
    if (response.status === 401) {
        token = await getAccessToken(true);

        if (!token) {
            throw createApiError(response, data);
        }

        try {
            response = await sendRequest(token);
        } catch (error) {
            const message = safeDisplayText(
                error?.message,
                "Failed to fetch"
            );

            const networkError = new Error(
                `Nepodarilo sa spojiť so serverom. ${message}`
            );

            networkError.network = true;

            throw networkError;
        }

        data = await parseResponse(response);
    }

    if (!response.ok) {
        throw createApiError(response, data);
    }

    if (!Array.isArray(data?.cars)) {
        throw new Error(
            "Server neposlal platné výsledky áut."
        );
    }

    if (data.cars.length !== 3) {
        throw new Error(
            "Server neposlal presne 3 výsledné autá."
        );
    }

    return data;
}


// ============================================================
// SAFE NUMBERS
// ============================================================

function safeNumber(value, fallback = null) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}


function formatNumber(value) {
    const number = safeNumber(value);

    if (number === null) {
        return "";
    }

    return new Intl.NumberFormat("sk-SK").format(number);
}


function formatPrice(value) {
    if (value === null || value === undefined) {
        return "Cena nie je dostupná";
    }

    if (typeof value === "object") {
        value = safeDisplayText(value, "");
    }

    const text = safeDisplayText(value, "");

    if (!text) {
        return "Cena nie je dostupná";
    }

    return text;
}


// ============================================================
// URL SAFETY
// ============================================================

function safeHTTPSUrl(value) {
    const text = safeDisplayText(value, "");

    if (!text) {
        return "";
    }

    try {
        const url = new URL(text);

        if (
            url.protocol !== "https:" &&
            url.protocol !== "http:"
        ) {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}


// ============================================================
// IMAGE
// ============================================================

function getImageCandidates(car) {
    if (!car || typeof car !== "object") {
        return [];
    }

    const candidates = [];

    if (Array.isArray(car.imageCandidates)) {
        candidates.push(...car.imageCandidates);
    }

    if (car.image) {
        candidates.push(car.image);
    }

    const result = [];

    for (const item of candidates) {
        let url = "";

        if (typeof item === "string") {
            url = safeHTTPSUrl(item);
        } else if (item && typeof item === "object") {
            url = safeHTTPSUrl(
                item.url ||
                item.image ||
                item.src ||
                item.href
            );
        }

        if (!url) {
            continue;
        }

        if (!result.includes(url)) {
            result.push(url);
        }
    }

    return result;
}


function bestImageForCar(car) {
    const candidates = getImageCandidates(car);

    return candidates[0] || "";
}


function renderImage(car) {
    const image = bestImageForCar(car);

    if (!image) {
        return `
            <div class="car-image no-image">
                <span>Fotografia nie je dostupná</span>
            </div>
        `;
    }

    return `
        <div class="car-image">
            <img
                src="${escapeAttribute(image)}"
                alt="${escapeAttribute(
                    safeDisplayText(car?.name, "Auto")
                )}"
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror="this.closest('.car-image')?.classList.add('image-error'); this.style.display='none';"
            >
        </div>
    `;
}


// ============================================================
// LISTS
// ============================================================

function renderList(value) {
    if (!Array.isArray(value)) {
        const text = safeDisplayText(value, "");

        return text
            ? `<div class="list-item">${escapeHTML(text)}</div>`
            : "";
    }

    return value
        .map(item => {
            const text = safeDisplayText(item, "");

            return text
                ? `<div class="list-item">• ${escapeHTML(text)}</div>`
                : "";
        })
        .filter(Boolean)
        .join("");
}


// ============================================================
// CAR CARD
// ============================================================

function renderCarCard(car, index) {
    if (!car || typeof car !== "object") {
        return "";
    }

    const name = safeDisplayText(
        car.name,
        "Neznáme vozidlo"
    );

    const generation = safeDisplayText(
        car.generation,
        ""
    );

    const year = safeDisplayText(
        car.year,
        ""
    );

    const score = safeNumber(
        car.score ?? car.matchScore,
        null
    );

    const price = formatPrice(
        car.price ??
        car.priceText ??
        car.officialPrice
    );

    const power = safeDisplayText(
        car.power ??
        car.powerKw ??
        car.kw,
        ""
    );

    const seats = safeDisplayText(
        car.seats,
        ""
    );

    const trunk = safeDisplayText(
        car.trunk ??
        car.trunkLiters ??
        car.boot,
        ""
    );

    const drive = safeDisplayText(
        car.drive,
        ""
    );

    const fuel = safeDisplayText(
        car.fuel,
        ""
    );

    const reason = safeDisplayText(
        car.reason ??
        car.matchReason ??
        car.description,
        ""
    );

    const maintenance = safeDisplayText(
        car.maintenance,
        ""
    );

    const officialPriceUrl = safeHTTPSUrl(
        car.officialPriceUrl ??
        car.priceUrl ??
        car.officialPriceLink
    );

    const configuratorUrl = safeHTTPSUrl(
        car.configuratorUrl ??
        car.configurator
    );

    const sources = Array.isArray(car.sources)
        ? car.sources
        : [];

    const sourceLinks = sources
        .map(source => {
            const url = safeHTTPSUrl(
                source?.url ??
                source?.href ??
                source
            );

            if (!url) {
                return "";
            }

            const label = safeDisplayText(
                source?.title ??
                source?.name ??
                url,
                "Zdroj"
            );

            return `
                <a
                    class="source-link"
                    href="${escapeAttribute(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    ${escapeHTML(label)}
                </a>
            `;
        })
        .filter(Boolean)
        .join("");

    const imageCandidates = getImageCandidates(car);

    return `
        <article class="car">

            ${renderImage(car)}

            <div class="car-body">

                <div class="car-top">

                    <div class="rank">
                        #${index + 1}
                    </div>

                    ${
                        score !== null
                            ? `
                                <div class="score">
                                    ${escapeHTML(
                                        formatNumber(score)
                                    )} %
                                </div>
                            `
                            : ""
                    }

                </div>

                <h2 class="car-name">
                    ${escapeHTML(name)}
                </h2>

                ${
                    generation || year
                        ? `
                            <div class="generation">
                                ${escapeHTML(
                                    [generation, year]
                                        .filter(Boolean)
                                        .join(" • ")
                                )}
                            </div>
                        `
                        : ""
                }

                <div class="specs">

                    ${
                        price
                            ? `
                                <div class="spec">
                                    <span>Cena</span>
                                    <strong>
                                        ${escapeHTML(price)}
                                    </strong>
                                </div>
                            `
                            : ""
                    }

                    ${
                        power
                            ? `
                                <div class="spec">
                                    <span>Výkon</span>
                                    <strong>
                                        ${escapeHTML(power)}
                                    </strong>
                                </div>
                            `
                            : ""
                    }

                    ${
                        seats
                            ? `
                                <div class="spec">
                                    <span>Miesta</span>
                                    <strong>
                                        ${escapeHTML(seats)}
                                    </strong>
                                </div>
                            `
                            : ""
                    }

                    ${
                        trunk
                            ? `
                                <div class="spec">
                                    <span>Kufor</span>
                                    <strong>
                                        ${escapeHTML(trunk)}
                                    </strong>
                                </div>
                            `
                            : ""
                    }

                    ${
                        drive
                            ? `
                                <div class="spec">
                                    <span>Pohon</span>
                                    <strong>
                                        ${escapeHTML(drive)}
                                    </strong>
                                </div>
                            `
                            : ""
                    }

                    ${
                        fuel
                            ? `
                                <div class="spec">
                                    <span>Palivo</span>
                                    <strong>
                                        ${escapeHTML(fuel)}
                                    </strong>
                                </div>
                            `
                            : ""
                    }

                </div>

                ${
                    reason
                        ? `
                            <section class="section">
                                <h3>Prečo toto auto?</h3>
                                <p>
                                    ${escapeHTML(reason)}
                                </p>
                            </section>
                        `
                        : ""
                }

                ${
                    car.pros
                        ? `
                            <section class="section pros">
                                <h3>Výhody</h3>
                                ${renderList(car.pros)}
                            </section>
                        `
                        : ""
                }

                ${
                    car.cons
                        ? `
                            <section class="section cons">
                                <h3>Nevýhody</h3>
                                ${renderList(car.cons)}
                            </section>
                        `
                        : ""
                }

                ${
                    maintenance
                        ? `
                            <section class="section">
                                <h3>Údržba</h3>
                                <p>
                                    ${escapeHTML(maintenance)}
                                </p>
                            </section>
                        `
                        : ""
                }

                ${
                    officialPriceUrl || configuratorUrl
                        ? `
                            <div class="actions">

                                ${
                                    officialPriceUrl
                                        ? `
                                            <a
                                                class="configure"
                                                href="${escapeAttribute(
                                                    officialPriceUrl
                                                )}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Oficiálna cena
                                            </a>
                                        `
                                        : ""
                                }

                                ${
                                    configuratorUrl
                                        ? `
                                            <a
                                                class="configure secondary"
                                                href="${escapeAttribute(
                                                    configuratorUrl
                                                )}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Konfigurátor
                                            </a>
                                        `
                                        : ""
                                }

                            </div>
                        `
                        : ""
                }

                ${
                    imageCandidates.length > 1
                        ? `
                            <div class="photo-info">
                                ${escapeHTML(
                                    `${imageCandidates.length} overených fotografií`
                                )}
                            </div>
                        `
                        : ""
                }

                ${
                    sourceLinks
                        ? `
                            <section class="section sources">
                                <h3>Zdroje</h3>
                                <div class="source-list">
                                    ${sourceLinks}
                                </div>
                            </section>
                        `
                        : ""
                }

            </div>

        </article>
    `;
}


// ============================================================
// RESULTS
// ============================================================

function renderResults(cars) {
    const results = getResultsElement();

    if (!results) {
        return;
    }

    if (!Array.isArray(cars) || cars.length !== 3) {
        results.innerHTML = `
            <div class="error-box">
                Server neposlal presne 3 výsledné autá.
            </div>
        `;
        return;
    }

    results.innerHTML = cars
        .slice(0, 3)
        .map((car, index) =>
            renderCarCard(car, index)
        )
        .join("");
}


// ============================================================
// ERROR
// ============================================================

function renderError(error) {
    const results = getResultsElement();

    const message = safeDisplayText(
        error?.message,
        "Vyhľadávanie sa nepodarilo dokončiť."
    );

    if (results) {
        results.innerHTML = `
            <div class="error-box">
                <strong>Vyhľadávanie sa nepodarilo dokončiť.</strong>
                <p>${escapeHTML(message)}</p>
            </div>
        `;
    }

    if (error?.status === 429) {
        setStatus(
            "Dosiahol si denný limit vyhľadávaní.",
            "error"
        );
        return;
    }

    if (error?.status === 503) {
        setStatus(
            "AI vyhľadávanie je momentálne nedostupné. Skús to znova.",
            "error"
        );
        return;
    }

    setStatus(
        "Vyhľadávanie sa nepodarilo dokončiť.",
        "error"
    );
}


// ============================================================
// USAGE
// ============================================================

function updateUsage(remaining) {
    const text = get("usageText");
    const dot = get("usageDot");

    const value = safeNumber(remaining, null);

    if (value === null) {
        if (text) {
            text.textContent =
                "Vyhľadávania sú dostupné.";
        }

        return;
    }

    if (text) {
        text.textContent =
            `Zostáva ${formatNumber(value)} vyhľadávaní dnes`;
    }

    if (dot) {
        dot.classList.toggle(
            "low",
            value <= 1
        );
    }
}


// ============================================================
// FEEDBACK
// ============================================================

function vibrate() {
    try {
        if (
            navigator.vibrate &&
            typeof navigator.vibrate === "function"
        ) {
            navigator.vibrate([
                100,
                60,
                140
            ]);
        }
    } catch {
        // Ignore vibration errors.
    }
}


function playReadySound() {
    try {
        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) {
            return;
        }

        const context = new AudioContext();

        const oscillator =
            context.createOscillator();

        const gain =
            context.createGain();

        oscillator.type = "sine";

        oscillator.frequency.setValueAtTime(
            620,
            context.currentTime
        );

        oscillator.frequency.linearRampToValueAtTime(
            880,
            context.currentTime + 0.12
        );

        gain.gain.setValueAtTime(
            0.0001,
            context.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.08,
            context.currentTime + 0.02
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            context.currentTime + 0.18
        );

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start();

        oscillator.stop(
            context.currentTime + 0.2
        );

        setTimeout(() => {
            context.close().catch(() => {});
        }, 400);

    } catch {
        // Audio can be blocked by browser.
    }
}


function notifySearchFinished() {
    vibrate();
    playReadySound();
}


// ============================================================
// SEARCH
// ============================================================

async function findCars() {
    if (searching) {
        return;
    }

    const payload = buildRequestPayload();

    if (!hasSearchInput(payload)) {
        setStatus(
            "Zadaj požiadavku alebo vyplň aspoň jeden filter.",
            "error"
        );
        return;
    }

    const results = getResultsElement();

    if (results) {
        results.innerHTML = "";
    }

    clearStatus();
    setButtonBusy(true);

    setStatus(
        "Vyhľadávam aktuálne informácie o vozidlách..."
    );

    try {
        const data = await performSearch(payload);

        renderResults(data.cars);

        if (
            data.remaining !== undefined &&
            data.remaining !== null
        ) {
            updateUsage(data.remaining);
        }

        setStatus(
            "Vyhľadávanie dokončené.",
            "success"
        );

        notifySearchFinished();

    } catch (error) {
        console.error(
            "CARMATCH AI search error:",
            error
        );

        renderError(error);

    } finally {
        setButtonBusy(false);
    }
}


// ============================================================
// INITIALIZATION
// ============================================================

async function initializeApp() {
    if (initialized) {
        return;
    }

    const button = getSearchButton();

    if (!button) {
        console.error(
            "CARMATCH AI: search button not found."
        );
        return;
    }

    button.addEventListener(
        "click",
        findCars
    );

    try {
        setStatus(
            "Pripravujem CARMATCH AI..."
        );

        await ensureAnonymousSession();

        initialized = true;

        button.disabled = false;

        updateUsage(null);

        setStatus(
            "CARMATCH AI je pripravené.",
            "success"
        );

    } catch (error) {
        console.error(
            "CARMATCH AI initialization error:",
            error
        );

        button.disabled = true;

        setStatus(
            "Nepodarilo sa inicializovať vyhľadávanie. Obnov stránku a skús znova.",
            "error"
        );
    }
}


// ============================================================
// ENTER / CTRL+ENTER
// ============================================================

function setupKeyboard() {
    const input = get("aiRequest");

    if (!input) {
        return;
    }

    input.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Enter" &&
                (event.ctrlKey || event.metaKey)
            ) {
                event.preventDefault();

                if (
                    initialized &&
                    !searching
                ) {
                    findCars();
                }
            }
        }
    );
}


// ============================================================
// START
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {
        setupKeyboard();
        initializeApp();
    }
);

window.findCars = findCars;