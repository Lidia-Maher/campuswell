/**
 * Shared queries and mutations. Screens use these instead of calling the API directly, so
 * the same data is cached once and the right lists refresh after a change.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Schemas, unwrap } from "./client";

export type Task = Schemas["TaskOut"];
export type TaskStatus = Task["status"];
export type Mood = Schemas["MoodOut"];

// ---- mood ----
export const useMoodStats = (days: number) =>
  useQuery({
    queryKey: ["moods", "stats", days],
    queryFn: () => unwrap(api.GET("/api/moods/stats", { params: { query: { days } } })),
  });

export const useMoods = (limit = 20) =>
  useQuery({
    queryKey: ["moods", "list", limit],
    queryFn: () => unwrap(api.GET("/api/moods", { params: { query: { limit } } })),
  });

export function useLogMood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["MoodCreate"]) => unwrap(api.POST("/api/moods", { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["moods"] });
      void qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

export function useDeleteMood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (logId: number) => unwrap(api.DELETE("/api/moods/{log_id}", { params: { path: { log_id: logId } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["moods"] }),
  });
}

// ---- study ----
export const useTasks = () =>
  useQuery({ queryKey: ["tasks"], queryFn: () => unwrap(api.GET("/api/tasks")) });

export const useStudyStats = (days: number) =>
  useQuery({
    queryKey: ["study", "stats", days],
    queryFn: () => unwrap(api.GET("/api/study/stats", { params: { query: { days } } })),
  });

function useStudyInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["study"] });
    void qc.invalidateQueries({ queryKey: ["insights"] });
  };
}

export function useCreateTask() {
  const refresh = useStudyInvalidation();
  return useMutation({
    mutationFn: (body: Schemas["TaskCreate"]) => unwrap(api.POST("/api/tasks", { body })),
    onSuccess: refresh,
  });
}

export function useUpdateTask() {
  const refresh = useStudyInvalidation();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["TaskUpdate"] & { id: number }) =>
      unwrap(api.PATCH("/api/tasks/{task_id}", { params: { path: { task_id: id } }, body })),
    onSuccess: refresh,
  });
}

export function useDeleteTask() {
  const refresh = useStudyInvalidation();
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE("/api/tasks/{task_id}", { params: { path: { task_id: id } } })),
    onSuccess: refresh,
  });
}

export function useLogPomodoro() {
  const refresh = useStudyInvalidation();
  return useMutation({
    mutationFn: (body: Schemas["PomodoroCreate"]) => unwrap(api.POST("/api/pomodoro", { body })),
    onSuccess: refresh,
  });
}

// ---- assessments ----
export const useAssessments = (limit = 20) =>
  useQuery({
    queryKey: ["assessments", limit],
    queryFn: () => unwrap(api.GET("/api/assessments", { params: { query: { limit } } })),
  });
