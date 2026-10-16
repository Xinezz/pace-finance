import { useCallback } from 'react';
import { findSimilar, makeRule, normalizeDescription, ruleKeyFor, shouldOfferRemember } from '../domain/categorize';
import { reducer } from '../state/reducer';
import { useFeedback } from '../state/feedback';
import { useStore } from '../state/store';

/**
 * The one place where a *manual* category choice is made.
 *
 * It always writes a manual category (which nothing may override), always offers Undo, and - when it
 * makes sense - offers to remember the preference so future transactions with the same description
 * are categorized the same way.
 */
export function useCategorize() {
  const { data, dispatch, undo } = useStore();
  const { toast } = useFeedback();

  const categorize = useCallback(
    (ids: string[], categoryId: string, opts: { quiet?: boolean } = {}) => {
      const cat = data.categories.find((c) => c.id === categoryId);
      if (!cat || ids.length === 0) return;
      const idSet = new Set(ids);
      const before = data.transactions.filter((t) => idSet.has(t.id));
      const changing = before.filter((t) => t.type !== 'transfer' && !(t.categoryId === categoryId && t.categorySource === 'manual'));
      if (changing.length === 0) return;

      dispatch({ type: 'setCategory', ids, categoryId }, { undoable: true });
      if (opts.quiet) return;

      const label = `${cat.icon} ${cat.name}`;
      const single = changing.length === 1 ? changing[0] : null;
      const message = single ? `“${single.description}” moved to ${label}.` : `${changing.length} transactions moved to ${label}.`;
      const actions: { label: string; onClick: () => void }[] = [{ label: 'Undo', onClick: () => void undo() }];

      // Offer to remember when it is a single description (or a group sharing one).
      const keys = new Set(changing.map((t) => ruleKeyFor(t.description)));
      const sharedKey = keys.size === 1 ? [...keys][0] : null;
      if (sharedKey && cat.id !== 'other') {
        const sample = changing[0];
        const next = reducer(data, { type: 'setCategory', ids, categoryId });
        const hasRule = data.rules.some((r) => r.pattern === sharedKey && r.categoryId === categoryId);
        const similarOpen = findSimilar(next.transactions, sample.description).filter((t) => idSet.has(t.id) === false && (t.categorySource === 'none' || t.categorySource === 'auto'));
        const repeat = shouldOfferRemember(next.transactions, data.rules, sample.description, categoryId);
        if (!hasRule && (repeat.offer || similarOpen.length > 0 || changing.length > 1)) {
          const extra = similarOpen.length > 0 ? ` and fix ${similarOpen.length} similar` : '';
          actions.unshift({
            label: `Remember${extra}`,
            onClick: () => {
              dispatch({ type: 'addRule', rule: makeRule(sharedKey, categoryId), applyToExisting: true });
              toast(`Done. “${normalizeDescription(sample.description)}” will go to ${label} from now on.`);
            },
          });
        }
      }
      toast(message, { actions, duration: 9000 });
    },
    [data, dispatch, undo, toast],
  );

  /** Confirm automatic suggestions as the user's own choice. */
  const confirm = useCallback(
    (ids: string[]) => {
      dispatch({ type: 'confirmAuto', ids }, { undoable: true });
      toast(ids.length === 1 ? 'Category confirmed.' : `${ids.length} categories confirmed.`, { actions: [{ label: 'Undo', onClick: () => void undo() }] });
    },
    [dispatch, undo, toast],
  );

  return { categorize, confirm };
}
