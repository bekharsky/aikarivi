/* Small DOM components, shared by every dropdown in the web app. */
const AikariviUI = (() => {
  let activePopover = null;

  class Popover {
    constructor({ root, trigger, panel }) {
      this.root = root;
      this.trigger = trigger;
      this.panel = panel;
      this.isMenu = panel.getAttribute("role") === "menu";
      this.typeahead = "";
      this.typeaheadAt = 0;
      this.typeaheadTimeout = parseFloat(getComputedStyle(root).getPropertyValue("--menu-typeahead-timeout"));
      trigger.setAttribute("aria-haspopup", this.isMenu ? "menu" : "dialog");
      trigger.setAttribute("aria-controls", panel.id);
      trigger.setAttribute("aria-expanded", "false");
      panel.hidden = true;

      trigger.addEventListener("click", (event) => {
        if (this.opened) this.close();
        else this.open({ focus: this.isMenu || event.detail === 0 });
      });
      trigger.addEventListener("keydown", (event) => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        this.open({ focus: true, edge: event.key === "ArrowUp" ? "last" : "first" });
      });
      panel.addEventListener("keydown", (event) => this.onKeyDown(event));
      panel.addEventListener("click", (event) => {
        if (event.target.closest("[data-menu-close]")) this.close();
      });
    }

    get opened() { return !this.panel.hidden; }

    open({ focus = false, edge = null } = {}) {
      if (this.trigger.disabled) return;
      if (activePopover && activePopover !== this) activePopover.close({ restoreFocus: false });
      activePopover = this;
      this.panel.hidden = false;
      this.root.classList.add("is-open");
      this.trigger.setAttribute("aria-expanded", "true");
      this.position();
      if (focus) this.focusItem(edge);
    }

    close({ restoreFocus = this.panel.contains(document.activeElement) } = {}) {
      if (!this.opened) return;
      this.panel.hidden = true;
      this.root.classList.remove("is-open");
      this.trigger.setAttribute("aria-expanded", "false");
      this.typeahead = "";
      if (activePopover === this) activePopover = null;
      if (restoreFocus && !this.trigger.closest("[hidden]")) this.trigger.focus({ preventScroll: true });
    }

    setOpen(open) { if (open) this.open(); else this.close(); }

    items() {
      const selector = this.isMenu ? '[role^="menuitem"]:not(:disabled)' : 'button:not(:disabled), input:not(:disabled)';
      return [...this.panel.querySelectorAll(selector)];
    }

    focusItem(edge) {
      const items = this.items();
      const item = edge === "last" ? items.at(-1) : edge === "first" ? items[0] :
        items.find((candidate) => candidate.getAttribute("aria-checked") === "true") || items[0];
      if (item) {
        item.focus({ preventScroll: true });
        item.scrollIntoView({ block: "nearest" });
      }
    }

    onKeyDown(event) {
      if (!this.isMenu) return;
      if (event.key === "Tab") {
        // Resume the page's normal tab order at the trigger.
        this.close({ restoreFocus: true });
        return;
      }
      const items = this.items();
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length :
        event.key === "ArrowUp" ? (index - 1 + items.length) % items.length :
        event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
      if (next !== null) {
        event.preventDefault();
        items[next].focus({ preventScroll: true });
        items[next].scrollIntoView({ block: "nearest" });
      } else if (event.key.length === 1 && event.key !== " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const now = Date.now();
        this.typeahead = now - this.typeaheadAt < this.typeaheadTimeout ? this.typeahead + event.key : event.key;
        this.typeaheadAt = now;
        const query = this.typeahead.toLocaleLowerCase();
        const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
        const match = ordered.find((item) => item.textContent.trim().toLocaleLowerCase().startsWith(query));
        if (match) {
          match.focus({ preventScroll: true });
          match.scrollIntoView({ block: "nearest" });
        }
      }
    }

    position() {
      this.root.dataset.placement = "bottom";
      this.panel.style.removeProperty("--popover-shift-x");
      const styles = getComputedStyle(this.panel);
      const gutter = parseFloat(styles.getPropertyValue("--popover-viewport-gutter"));
      const gap = parseFloat(styles.getPropertyValue("--popover-gap"));
      const trigger = this.trigger.getBoundingClientRect();
      const below = innerHeight - trigger.bottom - gap - gutter;
      const above = trigger.top - gap - gutter;
      const placeAbove = this.panel.scrollHeight > below && above > below;
      this.root.dataset.placement = placeAbove ? "top" : "bottom";
      this.panel.style.setProperty("--popover-height-limit", `${Math.max(0, Math.floor(placeAbove ? above : below))}px`);
      const panel = this.panel.getBoundingClientRect();
      const shift = Math.min(0, innerWidth - gutter - panel.right) + Math.max(0, gutter - panel.left);
      this.panel.style.setProperty("--popover-shift-x", `${shift}px`);
    }
  }

  class SelectMenu extends Popover {
    constructor({ list, onChange, ...options }) {
      super(options);
      this.list = list;
      this.onChange = onChange;
      list.addEventListener("click", (event) => {
        const item = event.target.closest("[data-select-value]");
        if (!item || !list.contains(item) || item.disabled) return;
        const value = item.dataset.selectValue;
        this.close({ restoreFocus: true });
        this.onChange(value);
      });
    }

    setOptions(options, selectedValue) {
      const focused = this.panel.contains(document.activeElement) ? document.activeElement.dataset.selectValue : null;
      const fragment = document.createDocumentFragment();
      options.forEach(({ value, label }) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ui-menu-item ui-menu-item--check";
        item.setAttribute("role", "menuitemradio");
        item.setAttribute("tabindex", "-1");
        item.dataset.selectValue = String(value);
        const selected = String(value) === String(selectedValue);
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-checked", String(selected));
        item.title = label;
        const text = document.createElement("span");
        text.className = "ui-menu-label";
        text.textContent = label;
        item.append(text);
        fragment.append(item);
      });
      this.list.replaceChildren(fragment);
      this.trigger.disabled = options.length === 0;
      if (this.opened) {
        this.position();
        if (focused !== null) {
          const item = [...this.list.children].find((candidate) => candidate.dataset.selectValue === focused);
          if (item) item.focus({ preventScroll: true });
        }
      }
    }
  }

  const closeOutside = (event) => {
    if (activePopover && !activePopover.root.contains(event.target)) activePopover.close({ restoreFocus: false });
  };
  document.addEventListener("pointerdown", closeOutside);
  document.addEventListener("focusin", closeOutside);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activePopover) {
      event.preventDefault();
      activePopover.close({ restoreFocus: true });
    }
  });
  window.addEventListener("resize", () => activePopover?.position());

  return Object.freeze({ Popover, SelectMenu });
})();
