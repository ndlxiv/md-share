import { handleView } from "../../_lib/view.js";

export const onRequestGet = (context) => handleView(context, "GET");
export const onRequestPost = (context) => handleView(context, "POST");
