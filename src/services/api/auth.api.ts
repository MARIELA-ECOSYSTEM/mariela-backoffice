import { apiClient, setToken } from "./client";
import type { LoginRequest, LoginResponse, Usuario } from "@/types/auth";

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>("/auth/login", payload);
    setToken(data.accessToken);
    return data;
  },
  async me(): Promise<Usuario> {
    const { data } = await apiClient.get<Usuario>("/auth/me");
    return data;
  },
  logout(): void {
    setToken(null);
  },
};
