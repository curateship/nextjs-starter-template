package app.date.phone

/**
 * How the link is doing, for the app's screen: when the server last answered,
 * the last problem in words, and why the phone was unpaired. Held in memory;
 * the service writes it and the screen reads it once a second.
 */
object LinkStatus {
    @Volatile
    var lastAnswerAt: Long = 0L
        private set

    @Volatile
    var lastProblem: String = ""
        private set

    /** The server's words when it stopped knowing this phone. Empty while paired. */
    @Volatile
    var unpairedWords: String = ""

    fun answered() {
        lastAnswerAt = System.currentTimeMillis()
        lastProblem = ""
    }

    fun failed(words: String) {
        lastProblem = words
    }

    fun reset() {
        lastAnswerAt = 0L
        lastProblem = ""
        unpairedWords = ""
    }
}
