/** A post date as written in content: a year ("2024"), a month ("2023-07") or a day ("2023-07-14"). */
export const POST_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

export interface PostDate {
  /** For <time datetime>: exactly as precise as the content, never padded with a made-up day. */
  datetime: string;
  text: string;
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * What a post shows under its actions. A label ("Jul – Sep 2023") wins over the formatted date,
 * and a date only as precise as the résumé ("2024") is shown as just the year.
 */
export function postDate(date?: string, label?: string): PostDate | undefined {
  if (!date) return label ? { datetime: '', text: label } : undefined;
  if (!POST_DATE.test(date))
    throw new Error(`Not a post date: "${date}" (use YYYY, YYYY-MM or YYYY-MM-DD)`);
  const [year, month] = date.split('-');
  const text = label ?? (month ? MONTH.format(Date.UTC(Number(year), Number(month) - 1)) : year);
  return { datetime: date, text };
}
