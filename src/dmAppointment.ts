import { MachineConfig, send, Action, assign } from "xstate";


function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

const grammar: { [index: string]: { title?: string, day?: string, time?: string } } = {
    "Lecture.": { title: "Dialogue systems lecture" },
    "Exam.": { title: "Exam at the university" },
    "on Monday": { day: "Monday" },
    "on Friday": { day: "Friday" },
    "on Saturday": { day: "Saturday" },
    "at ten": { time: "10:00" },
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
        info_meeting: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.title}`
            })),
            on: { ENDSPEECH: 'weekday' }
        },
        info_weekday: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.day}`
            })),
            on: { ENDSPEECH: 'weekday' }
        }
    }
})

const kbRequest = (text: string) =>
    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`)).then(data => data.json())
