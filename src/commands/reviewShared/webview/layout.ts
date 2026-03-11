type ShellOptions = {
  title: string;
  icon?: string;
  description: string;
  badge?: string;
  heroActions?: string;
  controlPanel: string;
  outputPanel: string;
};

type SectionOptions = {
  title: string;
  description?: string;
  content: string;
  tone?: "default" | "accent";
};

type EmptyStateOptions = {
  title: string;
  description: string;
  note?: string;
};

export function buildReviewShell(options: ShellOptions): string {
  return `
        <div class="shell">
            <header class="hero">
                <div class="hero__identity">
                    ${options.icon ? `<div class="hero__icon" aria-hidden="true">${options.icon}</div>` : ``}
                    <div>
                        <p class="hero__eyebrow">Git Mew review workspace</p>
                        <h1>${options.title}</h1>
                        <p class="hero__description">${options.description}</p>
                    </div>
                </div>
                <div class="hero__aside">
                    ${options.badge ? `<div class="hero__badge">${options.badge}</div>` : ""}
                    ${options.heroActions ? `<div class="hero__actions">${options.heroActions}</div>` : ""}
                </div>
            </header>
            <main class="dashboard" id="reviewDashboard">
                <section class="dashboard__panel dashboard__panel--controls" id="controlsPanel">
                    ${options.controlPanel}
                </section>
                <section class="dashboard__panel dashboard__panel--output" id="outputPanel">
                    ${options.outputPanel}
                </section>
            </main>
        </div>
    `;
}

export function buildPanelSection(options: SectionOptions): string {
  const toneClass = options.tone === "accent" ? " panel-section--accent" : "";
  const description = options.description
    ? `<p class="panel-section__description">${options.description}</p>`
    : "";

  return `
        <section class="panel-section${toneClass}">
            <div class="panel-section__header">
                <h2>${options.title}</h2>
                ${description}
            </div>
            <div class="panel-section__body">
                ${options.content}
            </div>
        </section>
    `;
}

export function buildEmptyState(options: EmptyStateOptions): string {
  return `
        <div id="emptyState" class="empty-state">
            <div class="empty-state__icon" aria-hidden="true">AI</div>
            <h2>${options.title}</h2>
            <p>${options.description}</p>
            ${options.note ? `<div class="empty-state__note">${options.note}</div>` : ""}
        </div>
    `;
}
