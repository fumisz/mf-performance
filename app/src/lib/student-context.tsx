import { createContext, useContext } from "react"
import type { StudentData } from "@/lib/student"
import { EMPTY_STUDENT_DATA } from "@/lib/student"

export const StudentContext = createContext<StudentData>(EMPTY_STUDENT_DATA)

export function useStudent() {
  return useContext(StudentContext)
}
