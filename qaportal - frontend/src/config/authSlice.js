import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  email: null,
  username: null,
  role: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action) {
      const { email, username, role } = action.payload;
      state.email = email;
      state.username = username;
      state.role = role;
      state.isAuthenticated = true;
    },
    logout(state) {
      state.email = null;
      state.username = null;
      state.role = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setUser, logout } = authSlice.actions;
export default authSlice.reducer;
