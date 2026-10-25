// Pick-and-place program for the gantry cell. Called once per tick by the cell (sim.js).
// The cell layout is specified in millimetres; the gantry is commanded in pixels.
export const CELL = {
  PICK_X_MM: 200,   // where the conveyor stops a part
  BIN_X_MM: 540,    // centre of the bin
  HOME_Y_MM: 67,    // gripper parked height (measured down from the rail)
  PICK_Y_MM: 242,   // gripper height at the top of a part on the conveyor
  CARRY_Y_MM: 125,  // safe carry height, clears the bin wall
};
export const PX_PER_MM = 1.2;
const mm = v => v * PX_PER_MM;

const GRIP_TIME = 0.3;     // s to close / open the gripper

export function createController() {
  let state = 'WAIT_PART';
  let timer = 0;

  return function step(io, dt) {
    const pickX = mm(CELL.PICK_X_MM);
    switch (state) {
      case 'WAIT_PART':
        if (io.moveTo(pickX, mm(CELL.HOME_Y_MM)) && io.partReady) state = 'DESCEND';
        break;
      case 'DESCEND':
        if (io.moveTo(pickX, mm(CELL.PICK_Y_MM))) { io.grip(true); timer = GRIP_TIME; state = 'GRIP'; }
        break;
      case 'GRIP':
        if ((timer -= dt) <= 0) state = 'LIFT';
        break;
      case 'LIFT':
        if (io.moveTo(pickX, mm(CELL.CARRY_Y_MM))) state = 'TO_BIN';
        break;
      case 'TO_BIN':
        if (io.moveTo(CELL.BIN_X_MM, mm(CELL.CARRY_Y_MM))) { io.grip(false); timer = GRIP_TIME; state = 'RELEASE'; }
        break;
      case 'RELEASE':
        if ((timer -= dt) <= 0) state = 'RETURN';
        break;
      case 'RETURN':
        if (io.moveTo(pickX, mm(CELL.HOME_Y_MM))) state = 'WAIT_PART';
        break;
    }
    return state;
  };
}
