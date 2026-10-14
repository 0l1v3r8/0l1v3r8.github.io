/**
 * Shared application configuration and utilities.
 */
const AppConfig = Object.freeze({
    MONTH_NAMES: [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ],
    SCROLL_STEP: 360,
    WHEEL_MULTIPLIER: 2.0,
    TOAST_DURATION_MS: 2500
});

/**
 * Formats a numeric month (1-12) and year into "MMM YYYY".
 * @param {number} month
 * @param {number} year
 * @returns {string}
 */
function formatMonthYear(month, year) {
    const monthIndex = Math.max(0, Math.min(11, Number(month) - 1));
    return `${AppConfig.MONTH_NAMES[monthIndex]} ${year}`;
}

/**
 * Escapes HTML special characters to prevent malformed markup.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Service for copying text to the clipboard and showing a non-blocking toast.
 */
class ClipboardService {
    /**
     * @param {string} toastElementId
     */
    constructor(toastElementId = "copy-toast") {
        this.toastElement = document.getElementById(toastElementId);
        this.hideTimeout = null;
    }

    /**
     * Copies an email address to the clipboard and triggers the toast notification.
     * @param {Event} event
     * @param {string} email
     */
    copyEmail(event, email) {
        event.preventDefault();
        if (!navigator.clipboard) return;

        navigator.clipboard.writeText(email).then(() => {
            this.showToast();
        });
    }

    showToast() {
        if (!this.toastElement) return;
        clearTimeout(this.hideTimeout);
        this.toastElement.classList.add("visible");

        this.hideTimeout = setTimeout(() => {
            this.toastElement.classList.remove("visible");
        }, AppConfig.TOAST_DURATION_MS);
    }
}

/**
 * Manages horizontal scrolling, arrow button visibility, and smart mouse-wheel navigation.
 */
class TrackController {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container
     * @param {HTMLButtonElement} [options.leftBtn]
     * @param {HTMLButtonElement} [options.rightBtn]
     */
    constructor({ container, leftBtn, rightBtn }) {
        this.container = container;
        this.leftBtn = leftBtn;
        this.rightBtn = rightBtn;
        this.init();
    }

    init() {
        if (!this.container) return;

        this.container.addEventListener("wheel", (e) => this.handleWheel(e), { passive: false });
        this.container.addEventListener("scroll", () => this.updateArrows(), { passive: true });
        window.addEventListener("resize", () => this.updateArrows(), { passive: true });

        if (this.leftBtn) {
            this.leftBtn.addEventListener("click", () => {
                this.container.scrollBy({ left: -AppConfig.SCROLL_STEP, behavior: "smooth" });
            });
        }

        if (this.rightBtn) {
            this.rightBtn.addEventListener("click", () => {
                this.container.scrollBy({ left: AppConfig.SCROLL_STEP, behavior: "smooth" });
            });
        }

        this.updateArrows();
    }

    /**
     * Translates vertical wheel motion into horizontal track scroll unless the cursor
     * is actively scrolling inside a vertically overflowing card.
     * @param {WheelEvent} e
     */
    handleWheel(e) {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        const scrollableCard = e.target.closest(".track-item-scrollable");
        if (scrollableCard && scrollableCard.scrollHeight > scrollableCard.clientHeight) {
            const canScrollUp = e.deltaY < 0 && scrollableCard.scrollTop > 0;
            const canScrollDown =
                e.deltaY > 0 &&
                scrollableCard.scrollTop + scrollableCard.clientHeight < scrollableCard.scrollHeight - 1;

            if (canScrollUp || canScrollDown) {
                return; // Allow native vertical scrolling inside the card
            }
        }

        e.preventDefault();
        this.container.scrollLeft += e.deltaY * AppConfig.WHEEL_MULTIPLIER;
    }

    /**
     * Updates the disabled state of the left/right scroll buttons based on scroll position.
     */
    updateArrows() {
        if (!this.container) return;
        const { scrollLeft, clientWidth, scrollWidth } = this.container;

        if (this.leftBtn) {
            this.leftBtn.disabled = scrollLeft <= 2;
        }
        if (this.rightBtn) {
            this.rightBtn.disabled = scrollLeft + clientWidth >= scrollWidth - 2;
        }
    }

    /**
     * Scrolls the track all the way to the right (most recent timeline items).
     */
    scrollToEnd() {
        if (!this.container) return;
        requestAnimationFrame(() => {
            this.container.scrollLeft = this.container.scrollWidth;
            this.updateArrows();
        });
    }
}

/**
 * Renders and manages category filter checkboxes.
 */
class FilterController {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container
     * @param {string[]} options.categories
     * @param {string} [options.variantClass]
     * @param {function(string[]): void} options.onFilterChange
     */
    constructor({ container, categories, variantClass = "", onFilterChange }) {
        this.container = container;
        this.categories = categories;
        this.variantClass = variantClass;
        this.onFilterChange = onFilterChange;
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = this.categories
            .map(
                (category) => `
        <label class="filter-label ${this.variantClass}">
          <input type="checkbox" name="category" value="${escapeHtml(category)}" class="filter-checkbox">
          ${escapeHtml(category)}
        </label>
      `
            )
            .join("");

        this.container.querySelectorAll(".filter-checkbox").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                checkbox.parentElement.classList.toggle("active", checkbox.checked);
                this.onFilterChange(this.getSelectedCategories());
            });
        });
    }

    /**
     * @returns {string[]}
     */
    getSelectedCategories() {
        return [...this.container.querySelectorAll(".filter-checkbox:checked")].map((cb) => cb.value);
    }
}

/**
 * RFC-compliant CSV parser for timeline achievement records.
 */
class CsvParser {
    /**
     * Parses CSV text into structured timeline event DTOs.
     * @param {string} csvText
     * @returns {Array<{month: number, year: number, event: string, category: string[], description: string, link: string}>}
     */
    static parseAchievements(csvText) {
        const lines = csvText.trim().split(/\r?\n/);
        if (lines.length < 2) return [];

        const csvRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
        const headers = lines[0]
            .split(csvRegex)
            .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

        const colIndex = {
            month: headers.indexOf("month"),
            year: headers.indexOf("year"),
            event: headers.indexOf("event"),
            category: headers.indexOf("category"),
            description: headers.indexOf("description"),
            link: headers.indexOf("link")
        };

        const events = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const vals = line
                .split(csvRegex)
                .map((v) => (v ? v.trim().replace(/^"|"$/g, "").replace(/""/g, '"') : ""));

            events.push({
                month: parseInt(vals[colIndex.month], 10) || 1,
                year: parseInt(vals[colIndex.year], 10) || 2000,
                event: vals[colIndex.event] || "",
                category: vals[colIndex.category]
                    ? vals[colIndex.category].split("|").map((c) => c.trim()).filter(Boolean)
                    : [],
                description: vals[colIndex.description] || "",
                link: vals[colIndex.link] || ""
            });
        }

        return events;
    }
}