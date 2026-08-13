import { useState } from "react"
import { motion } from "motion/react"
import { StudentNav, type Tab } from "@/components/student-nav"
import { StudentHome } from "@/screens/StudentHome"
import { StudentProgress } from "@/screens/StudentProgress"
import { StudentAvisos } from "@/screens/StudentAvisos"
import { StudentConta } from "@/screens/StudentConta"

export default function App() {
  const [tab, setTab] = useState<Tab>("home")

  const screen =
    tab === "prog" ? (
      <StudentProgress />
    ) : tab === "avisos" ? (
      <StudentAvisos />
    ) : tab === "conta" ? (
      <StudentConta />
    ) : (
      <StudentHome />
    )

  return (
    <div className="theme-aluno dark min-h-screen bg-background text-foreground">
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {screen}
      </motion.div>
      <StudentNav tab={tab} onTab={setTab} unread={2} />
    </div>
  )
}
