import { useAuth } from "@workos/authkit-tanstack-react-start/client";

type UserOrNull = ReturnType<typeof useAuth>["user"];

export const useUser = (): UserOrNull => {
  const { user } = useAuth();
  return user;
};
