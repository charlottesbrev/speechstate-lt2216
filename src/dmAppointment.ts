import { MachineConfig, send, Action, assign } from "xstate";


function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

const grammar: { [index: string]: { title?: string, day?: string, time?: string } } = {
    "Lab.": { title: "Laboration" },
    "Lecture.": { title: "Dialogue systems lecture" },
    "Exam.": { title: "Exam at the university" },
    "On Monday.": { day: "Monday" },
    "On Tuesday.": { day: "Tuesday" },
    "On Wednesday.": { day: "Wednesday" },
    "On Thirsday.": { day: "Thirsday" },
    "On Friday.": { day: "Friday" },
    "On Saturday.": { day: "Saturday" },
    "On Sunday.": { day: "Sunday" },
    "At 8:00": { time: "08:00" },
    "At 9:00": { time: "09:00" },
    "At 10": { time: "10:00" },
    "At 11": { time: "11:00" },
    "At 12": { time: "12:00" },
    "At 13": { time: "13:00" },
    "At 14": { time: "14:00" },
    "At 15": { time: "15:00" },
    "At 16": { time: "16:00" },
}

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: {
        idle: {
            on: {
                CLICK: 'init'
            }
        },
        init: {
            on: {
                TTS_READY: 'welcome',
                CLICK: 'welcome'
            }
        },
        welcome: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: 'info_meeting',
                        cond: (context) => "title" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ title: (context) => grammar[context.recResult[0].utterance].title! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("Let's create a meeting. What is it about?"),
                    on: { ENDSPEECH: 'ask_meeting' }
                },
                ask_meeting: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me something I know."),
                    on: { ENDSPEECH: 'ask_meeting' }
                }
            }
        },
        info_meeting: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.title}`
            })),
            on: { ENDSPEECH: 'weekday' }
        },
        weekday: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: 'info_weekday',
                        cond: (context) => "day" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ day: (context) => grammar[context.recResult[0].utterance].day! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("On which day is it?"),
                    on: { ENDSPEECH: 'ask_day' }
                },
                ask_day: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me a weekday."),
                    on: { ENDSPEECH: 'ask_day' }
                }
            }
        },
        info_weekday: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.day}`
            })),
            on: { ENDSPEECH: 'timeofday' }
        },
        timeofday: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: 'info_timeofday',
                        cond: (context) => "time" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ time: (context) => grammar[context.recResult[0].utterance].time! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("On which hour is it?"),
                    on: { ENDSPEECH: 'ask_time' }
                },
                ask_time: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what hour that is. Tell me an hour."),
                    on: { ENDSPEECH: 'ask_time' }
                }
            }
        },
        info_timeofday: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.time}`
            })),
            on: { ENDSPEECH: 'timeofday' }
        }
    }
})

const kbRequest = (text: string) =>
    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`)).then(data => data.json())
