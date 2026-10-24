const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function listTemplateKeys(template: string): string[] {
  return [...template.matchAll(TOKEN)].map((match) => match[1]);
}

/** A template can replace the caller's copy only when every filler was provided. */
export function canApplyPushTemplate(template: string, vars: Record<string, string>): boolean {
  return listTemplateKeys(template).every((key) => Object.prototype.hasOwnProperty.call(vars, key));
}

export function renderPushTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(TOKEN, (_, key: string) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? "") : "",
    )
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function applyPushTemplates(input: {
  title: string;
  message: string;
  url?: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  urlTemplate?: string | null;
  vars: Record<string, string>;
  contentFromDb: boolean;
}): { title: string; message: string; url?: string } {
  if (!input.contentFromDb) {
    return {
      title: input.title,
      message: input.message,
      url: input.url || undefined,
    };
  }

  const title = canApplyPushTemplate(input.titleTemplate, input.vars)
    ? renderPushTemplate(input.titleTemplate, input.vars)
    : input.title;
  const message = canApplyPushTemplate(input.bodyTemplate, input.vars)
    ? renderPushTemplate(input.bodyTemplate, input.vars)
    : input.message;

  let url = input.url || undefined;
  if (input.urlTemplate && canApplyPushTemplate(input.urlTemplate, input.vars)) {
    const renderedUrl = renderPushTemplate(input.urlTemplate, input.vars);
    if (renderedUrl) url = renderedUrl;
  }

  return {
    title: title || input.title,
    message: message || input.message,
    url,
  };
}
