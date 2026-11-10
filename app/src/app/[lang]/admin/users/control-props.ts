import "server-only";
import type { Dictionary } from "@/i18n/dictionary";
import {
  createUser,
  resetPassword,
  setUserActive,
  unlockLogin,
} from "./actions";
import type { UserControls } from "./user-controls";

type PersonWithUser = {
  id: string;
  name: string;
  surname: string;
  mail: string;
  user: { id: string; isActive: boolean; passwordMustChange: boolean } | null;
};

/**
 * Props of `UserControls` for a person: the user's status and the actions
 * already bound to its id. `lockedMails` comes from `getLockedMails`.
 */
export function userControlProps(
  person: PersonWithUser,
  options: {
    lockedMails: Map<string, Date>;
    currentUserId: string;
    formatTime: (date: Date) => string;
    t: Dictionary["users"];
  },
): React.ComponentProps<typeof UserControls> {
  const { user } = person;
  const locked = user ? options.lockedMails.get(person.mail) : undefined;
  // Without a user only `create` is used; the others are not shown.
  const userId = user?.id ?? "";
  return {
    personName: `${person.name} ${person.surname}`,
    user: user
      ? { isActive: user.isActive, mustChange: user.passwordMustChange }
      : null,
    lockedUntil: locked ? options.formatTime(locked) : null,
    isSelf: user?.id === options.currentUserId,
    actions: {
      create: createUser.bind(null, person.id),
      reset: resetPassword.bind(null, userId),
      deactivate: setUserActive.bind(null, userId, false),
      reactivate: setUserActive.bind(null, userId, true),
      unlock: unlockLogin.bind(null, userId),
    },
    t: options.t,
  };
}
