import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User, AuthSession } from '../../core/types';

interface AuthState {
    user: User | null;
    session: AuthSession | null;
    isAuthenticated: boolean;
}

const initialState: AuthState = {
    user: null,
    session: null,
    isAuthenticated: false,
};

export const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        loginSuccess: (state, action: PayloadAction<{ user: User; session: AuthSession }>) => {
            state.user = action.payload.user;
            state.session = action.payload.session;
            state.isAuthenticated = true;
        },
        logout: (state) => {
            state.user = null;
            state.session = null;
            state.isAuthenticated = false;
        },
    },
});

export default authSlice.reducer;
