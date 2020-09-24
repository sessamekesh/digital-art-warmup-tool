import { Button, FormHelperText, MenuItem, Select } from '@material-ui/core';
import * as React from 'react';
import { CountdownCircleTimer } from 'react-countdown-circle-timer';
import { AppService } from './appservice';
import { Point } from './data';
import { ExerciseType, ExersizeSize } from './exercisetype';

interface State {
    isFirstPlay: boolean,
    isRunning: boolean,
    exerciseType: ExerciseType,
    exerciseSize: ExersizeSize,
    timerExecutionId: number,
    timerTime: number,
    newTimerTime: number,
}

function toPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    return {x: e.clientX, y: e.clientY};
}

export class App extends React.Component<{}, State> {
    private canvas_: HTMLCanvasElement|null = null;
    private app_: AppService|null = null;

    constructor(props: {}) {
        super(props);
        this.state = {
            isFirstPlay: true,
            isRunning: false,
            exerciseType: ExerciseType.LINES,
            exerciseSize: ExersizeSize.ANYTHING_GOES,
            timerExecutionId: 0,
            timerTime: 0,
            newTimerTime: 60,
        };
    }

    componentDidMount() {
        if (!this.canvas_) {
            console.error('Failed to start app - no canvas found');
            return;
        }

        const ctx = this.canvas_.getContext('2d');
        if (!ctx) {
            console.error('Failed to start app - no context created');
            return;
        }

        this.canvas_.width = this.canvas_.clientWidth;
        this.canvas_.height = this.canvas_.clientHeight;

        this.app_ = new AppService(ctx);
        this.app_.start();
    }
    
    render() {
        return <div style={this.topStyle}>
            <canvas
                id="draw-surface" ref={(e)=>{this.canvas_ = e}} style={this.canvasStyle}
                onPointerOver={(evt: React.PointerEvent<HTMLCanvasElement>) => {
                    this.app_?.hover(toPoint(evt));
                }}
                onPointerLeave={(evt: React.PointerEvent<HTMLCanvasElement>) => {
                    this.app_?.lift(toPoint(evt));
                }}
                onPointerUp={(evt: React.PointerEvent<HTMLCanvasElement>) => {
                    this.app_?.lift(toPoint(evt));
                }}
                onPointerMove={(evt: React.PointerEvent<HTMLCanvasElement>) => {
                    // Firefox hack: pressure comes back 0 always because of long standing bug, if
                    //  that's the case just use 0.5 instead. Pressure = 0 is _really really_ hard
                    //  to hit in a natural user setting, so it can pretty much be safely ignored?
                    // TODO (sessamekesh): Confirm that.
                    this.app_?.move(toPoint(evt), evt.pressure || 0.5);
                    evt.preventDefault();
                    evt.stopPropagation();
                }}
                onPointerDown={(evt: React.PointerEvent<HTMLCanvasElement>) => {
                    this.app_?.down(toPoint(evt));
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                >
                HTML5 Canvas not available
            </canvas>
            <div style={this.sidebarStyle}>
                <div style={{justifySelf: 'center', width: '100%'}}>
                    <CountdownCircleTimer
                        size={260}
                        onComplete={() => {
                            this.setState({
                                isRunning: false,
                            });
                            this.app_?.stopExercies();
                            return [false, 0];
                        }}
                        duration={this.state.timerTime}
                        isPlaying={this.state.isRunning}
                        colors={[["#004777", 0.33], ["#F7B801", 0.33], ["#A30000", 0.33]]}
                        children={({remainingTime}) => {
                            remainingTime = remainingTime || 0;
                            const minutes = Math.floor((remainingTime % 3600) / 60);
                            const seconds = (remainingTime || 0) % 60;

                            const secondsString = '0' + seconds;
                            const minutesString = '0' + minutes;

                            const str = (remainingTime > 0) ? `${minutesString.substr(-2)}:${secondsString.substr(-2)}`
                            : (this.state.isFirstPlay ? 'Press "Start"' : 'Finished!');

                            return (
                                <div style={{fontSize: '18pt'}}>{str}</div>
                            );
                        }}
                        key={'timer-' + this.state.timerExecutionId}
                    />
                </div>
                <div style={{border: '1px solid black', margin: '20px 0'}} />
                <Select label="Exercise"
                    value={this.state.exerciseType}

                    onChange={(change: React.ChangeEvent<{value: ExerciseType}>) => {
                        this.setState({
                            exerciseType: change.target.value,
                            isRunning: false,
                            timerExecutionId: this.state.timerExecutionId+1,
                        });
                    }}>
                    <MenuItem value={ExerciseType.LINES}>Lines</MenuItem>
                    <MenuItem value={ExerciseType.CIRCLES} disabled>Circles</MenuItem>
                    <MenuItem value={ExerciseType.OVALS} disabled>Ovals</MenuItem>
                </Select>
                <FormHelperText>Exercise</FormHelperText>
                <div style={{height: '8px'}} />
                <Select label="Size"
                    value={this.state.exerciseSize}

                    onChange={(change: React.ChangeEvent<{value: ExersizeSize}>) => {
                        this.setState({
                            exerciseSize: change.target.value,
                            isRunning: false,
                            timerExecutionId: this.state.timerExecutionId+1,
                        });
                    }}>
                    <MenuItem value={ExersizeSize.SMALL}>Small</MenuItem>
                    <MenuItem value={ExersizeSize.MEDIUM}>Medium</MenuItem>
                    <MenuItem value={ExersizeSize.LARGE}>Large</MenuItem>
                    <MenuItem value={ExersizeSize.ANYTHING_GOES}>Anything Goes</MenuItem>
                </Select>
                <FormHelperText>Size</FormHelperText>
                <div style={{height: '8px'}} />
                <Select label="Practice Time"
                    value={this.state.newTimerTime}

                    onChange={(change: React.ChangeEvent<{value: number}>) => {
                        this.setState({
                            newTimerTime: change.target.value,
                        });
                    }}>
                    <MenuItem value={60}>1 Minute</MenuItem>
                    <MenuItem value={120}>2 Minutes</MenuItem>
                    <MenuItem value={300}>5 Minutes</MenuItem>
                    <MenuItem value={600}>10 Minutes</MenuItem>
                </Select>
                <FormHelperText>Practice Time</FormHelperText>

                <Button color="primary" variant="outlined" onClick={() => {
                    if (!this.app_) {
                        alert('Error starting - check console');
                        return;
                    }
                    this.app_.clearDrawings();
                    this.setState({
                        isRunning: true,
                        timerTime: this.state.newTimerTime,
                        timerExecutionId: this.state.timerExecutionId+1,
                        isFirstPlay: false,
                    });
                    this.app_.startExercise(this.state.exerciseType, this.state.exerciseSize);
                }}>Start!</Button>
                <div style={{height: '8px'}} />
                {(()=>{
                    if (this.state.isFirstPlay && !this.state.isRunning) return null;
                    if (this.state.isRunning) {
                        return <Button color="secondary" variant="outlined" onClick={() => {
                            this.setState({
                                isRunning: false,
                            });
                        }}>Pause</Button>
                    } else {
                        return <Button color="secondary" variant="outlined" onClick={() => {
                            this.setState({
                                isRunning: true,
                            });
                        }}>Resume</Button>
                    }
                })()}
                <div style={{height: '8px'}} />
                <Button variant="outlined" onClick={() => {
                    this.app_?.clearDrawings();
                }}>Clear Canvas</Button>
                <div style={{border: '1px solid black', margin: '20px 0'}} />
                <p>Pick an <b>exercise</b> and <b>practice time</b> above, and click <b>start</b> to
                begin practicing.</p>
                <ul>
                    <li><b>Lines</b> Draw straight lines between random points</li>
                    <li><b>Circles</b> Draw the best circles you can</li>
                    <li><b>Ovals</b> Draw them tricky perspective circles: ovals!</li>
                </ul>
            </div>
        </div>;
    }

    private topStyle: React.CSSProperties = {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: '100%',
        height: '100%',

        display: 'flex',
        flexDirection: 'row',
    }

    private canvasStyle: React.CSSProperties = {
        backgroundColor: 'lightgrey',
        flexGrow: 2,
        touchAction: 'none',
    }

    private sidebarStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
        maxWidth: '280px',
        overflowY: 'scroll',
        overflowX: 'hidden',
        flexGrow: 1,
    };
}