export type Tab = 'tasks' | 'incidents' | 'account';

export type Route =
  | { name: 'pickList'; id: string }
  | { name: 'replacement'; id: string }
  | { name: 'incident'; id: string }
  | { name: 'incidentNew' }
  | { name: 'document'; id: string };

export interface NavState {
  tab: Tab;
  stack: Route[];
}

export type NavAction =
  | { type: 'push'; route: Route }
  | { type: 'pop' }
  | { type: 'tab'; tab: Tab }
  /** Ganti layar teratas (mis. dari form laporan ke detail insiden yang baru dibuat). */
  | { type: 'replace'; route: Route }
  | { type: 'reset' };

export const initialNav: NavState = { tab: 'tasks', stack: [] };

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'push':
      return { ...state, stack: [...state.stack, action.route] };
    case 'pop':
      return state.stack.length ? { ...state, stack: state.stack.slice(0, -1) } : state;
    case 'replace':
      return { ...state, stack: [...state.stack.slice(0, -1), action.route] };
    case 'tab':
      return { tab: action.tab, stack: [] };
    case 'reset':
      return initialNav;
  }
}

/** Tombol Back perangkat: true bila ada layar yang bisa ditutup. */
export const canPop = (state: NavState): boolean => state.stack.length > 0;
