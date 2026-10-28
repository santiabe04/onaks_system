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
 * Props de `UserControls` para una persona: estado del usuario y las actions
 * ya bindeadas a su id. `lockedMails` sale de `getLockedMails`.
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
  // Sin usuario solo se usa `create`; las demás no se muestran.
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
