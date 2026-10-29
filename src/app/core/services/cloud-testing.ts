/** Test double for the PostgREST reads that cloud sync makes. Not used by the app. */
export interface FakeCloudRow {
  id: string;
  payload: unknown;
  photos?: unknown;
  deleted: boolean;
  updated_at?: string;
}
export interface FakeSelect {
  table: string;
  columns: string;
  filters: string[];
}
export interface FakeTable {
  rows: FakeCloudRow[];
  /** Behave like a database where the updated_at migration has not been applied yet. */
  withoutUpdatedAt?: boolean;
  error?: { code: string; message: string } | null;
}

/** `select` for `client.from(table)`: filters, keyset, ordering and paging behave like the server. */
export function fakeSelect(table: string, source: () => FakeTable, log: FakeSelect[] = []) {
  return (columns: string) => {
    const filters: string[] = [];
    const orders: string[] = [];
    let from = 0;
    let count = Infinity;
    const query = {
      eq: () => query,
      gte: (column: string, value: string) => (filters.push(`${column}>=${value}`), query),
      or: (expression: string) => (filters.push(expression), query),
      order: (column: string) => (orders.push(column), query),
      limit: (value: number) => ((count = value), query),
      range: (start: number, end: number) => ((from = start), (count = end - start + 1), query),
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
        log.push({ table, columns, filters: [...filters] });
        try {
          resolve(run());
        } catch (error) {
          reject(error);
        }
      },
    };
    const run = () => {
      const state = source();
      if (state.error) return { data: null, error: state.error };
      const asks = [columns, ...filters, ...orders].some((part) => part.includes('updated_at'));
      if (state.withoutUpdatedAt && asks)
        return {
          data: null,
          error: { code: '42703', message: 'column updated_at does not exist' },
        };
      let rows = state.rows.filter((row) => filters.every((filter) => matches(row, filter)));
      rows = [...rows].sort((a, b) => {
        for (const column of orders) {
          const left = String(a[column as keyof FakeCloudRow] ?? '');
          const right = String(b[column as keyof FakeCloudRow] ?? '');
          if (left !== right) return left < right ? -1 : 1;
        }
        return 0;
      });
      const picked = columns.split(',');
      return {
        data: rows
          .slice(from, from + count)
          .map((row) =>
            Object.fromEntries(picked.map((column) => [column, row[column as keyof FakeCloudRow]])),
          ),
        error: null,
      };
    };
    return query;
  };
}

function matches(row: FakeCloudRow, filter: string): boolean {
  const at = row.updated_at ?? '';
  if (filter.startsWith('updated_at>=')) return at >= filter.slice('updated_at>='.length);
  const keyset =
    /^updated_at\.gt\.("(?:[^"\\]|\\.)*"),and\(updated_at\.eq\.("(?:[^"\\]|\\.)*"),id\.gt\.("(?:[^"\\]|\\.)*")\)$/.exec(
      filter,
    );
  // i18n-ignore: test helper
  if (!keyset) throw new Error('Unexpected filter: ' + filter);
  const [after, same, id] = keyset.slice(1).map((value) => JSON.parse(value) as string);
  return at > after! || (at === same && row.id > id!);
}
