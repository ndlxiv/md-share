import { EXPIRATION_OPTIONS } from "../../functions/_lib/files-core.js";
import { Icon } from "./icons/Icon";

export type OptionsState = { passwordProtected: boolean; password: string; expiration: string };

type ShareOptionsProps = {
  value: OptionsState;
  onChange: (next: OptionsState) => void;
  onSubmit: () => void;
  /** Present in edit mode: describes what the share currently has. */
  current?: { passwordProtected: boolean; expiresAt: string | null };
};

const formatDate = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function ShareOptions({ value, onChange, onSubmit, current }: ShareOptionsProps) {
  const set = (patch: Partial<OptionsState>) => onChange({ ...value, ...patch });
  const keepPassword = Boolean(current?.passwordProtected);
  const expiryHint =
    value.expiration === "keep"
      ? current?.expiresAt ? `Expires ${formatDate(current.expiresAt)}.` : "Never expires."
      : value.expiration === "never"
        ? "The share stays online until you delete it."
        : `The share is deleted automatically after ${EXPIRATION_OPTIONS.find((o) => o.value === value.expiration)?.label}${current ? " from now" : ""}.`;

  return (
    <form
      className="options-card card"
      aria-label="Share options"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="switch-row">
        <span><Icon name="lock" size={16} />Password protect</span>
        <input id="password-protect" type="checkbox" checked={value.passwordProtected} onChange={(event) => set({ passwordProtected: event.target.checked })} />
      </label>
      {value.passwordProtected && (
        <label className="field">
          <span>Password</span>
          <input
            id="share-password"
            type="password"
            autoComplete="new-password"
            value={value.password}
            placeholder={keepPassword ? "Leave blank to keep the current password" : "Choose a password"}
            onChange={(event) => set({ password: event.target.value })}
          />
        </label>
      )}
      <label className="field">
        <span>Expiration</span>
        <select id="expiration" value={value.expiration} onChange={(event) => set({ expiration: event.target.value })}>
          {current && <option value="keep">Keep current</option>}
          {EXPIRATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="meta option-hint"><Icon name="clock" size={14} />{expiryHint}</p>
      <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
    </form>
  );
}
