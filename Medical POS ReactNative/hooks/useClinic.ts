import { useSessionStore } from '../store/sessionStore';

export function useClinic() {
  const user = useSessionStore((state) => state.user);
  
  if (!user) {
    return { clinicId: null, role: null };
  }

  return {
    clinicId: user.clinic_id,
    role: user.role
  };
}
