import { useEffect, useState } from "react";

/**
 * localStorage 持久化状态。
 * 循环记录与处置历史使用各自独立的存储键分开保存，
 * 任一键损坏不影响另一个，重开页面自动恢复继续处理。
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T)
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`读取 ${key} 失败，使用初始值`, err);
    }
    return typeof initial === "function"
      ? (initial as () => T)()
      : initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      console.warn(`写入 ${key} 失败`, err);
    }
  }, [key, state]);

  return [state, setState];
}

export const STORAGE_KEYS = {
  records: "mud-desk.records.v1",
  cases: "mud-desk.cases.v1",
} as const;
